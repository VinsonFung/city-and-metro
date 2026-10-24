'use strict';
// 渲染：相机（平移/缩放/视图过渡）、地面与等距建筑分块缓存、分析图层、地铁网络、动态对象、标注
(function (CM) {
  const U = CM.U, CFG = CM.CFG, D = CM.DATA, LU = CM.LU;
  const ISO = [0.70710678, -0.70710678, 0.35355339, 0.35355339];
  const HSF = 0.82;                          // 高度屏幕系数
  const EX = 2.0 / CFG.CELL_M;               // 米 → 世界单位（夸张）
  const LEVELS = [8, 16, 32, 64];
  const CHUNK_PX = 512;
  const MAX_H = 5.0;                          // 世界单位（建筑最大高度，含广州塔天线）
  const FONT = '"PingFang SC","Microsoft YaHei","Noto Sans SC",sans-serif';
  const UNDER_DEPTH = 4;                      // 地下视图中地下线路的视觉下沉倍数

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
    this.layer = 'none'; this.layerOpt = { flow: 'all', station: 'all', stView: 'flow', stDt: 'avg', cover: 'time', facP: 'all', facDt: 'wd', gapDt: 'wd' };
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

  Renderer.prototype.noteFrameTime = function (ms) { this.lastFrameMs = ms; };
  Renderer.prototype.adaptDetail = function (dt) {
    const d = this.detail, elapsed = Math.min(0.1, dt || 1 / 60);
    const work = this.lastFrameMs == null ? (this.lastRenderMs || 0) : this.lastFrameMs;
    const missedFrame = dt > 1 / 45 ? dt * 1000 : 0;
    const cost = Math.min(100, Math.max(work, missedFrame, this.cachePx > CFG.perf.cacheMaxPx ? 20 : 0));
    d.ema += (cost - d.ema) * 0.12;
    d.busy = d.ema > 18 ? d.busy + elapsed : Math.max(0, d.busy - elapsed * 2);
    d.calm = d.ema < 12 ? d.calm + elapsed : 0;
    if (d.busy > 0.35 && d.tier < 2) { d.tier++; d.busy = 0; d.calm = 0; }
    if (d.calm > 1.1 && d.tier > 0) { d.tier--; d.calm = 0; }
    this.stats.detailTier = d.tier;
  };
  Renderer.prototype.textWidth = function (ctx, text) {
    const key = ctx.font + '|' + text;
    let width = this.textWidths.get(key);
    if (width === undefined) {
      width = ctx.measureText(text).width;
      if (this.textWidths.size >= 2048) this.textWidths.clear();
      this.textWidths.set(key, width);
    }
    return width;
  };
  Renderer.prototype.featurePath = function (feature, polygon) {
    let p = this.geoPaths.get(feature);
    if (!p) { p = new Path2D(); if (polygon) CM.Geo.tracePoly(p, feature); else CM.Geo.traceLine(p, feature.p); this.geoPaths.set(feature, p); }
    return p;
  };
  Renderer.prototype.clearImages = function () {
    this.cancelIsoJob();
    for (const cache of [this.ground, this.iso]) { for (const e of cache.values()) e.cv.width = e.cv.height = 1; cache.clear(); }
    this.cachePx = 0;
  };
  Renderer.prototype.cancelIsoJob = function () {
    const job = this.isoJob;
    if (job) { if (job.cv) job.cv.width = job.cv.height = 1; job.gen.return(); this.isoJob = null; }
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
  Renderer.prototype.fxRing = function (ctx, x, y, rw) {
    const tmp = {};
    ctx.beginPath();
    for (let a = 0; a <= 24; a++) { const t = a / 24 * Math.PI * 2; this.P(x + Math.cos(t) * rw, y + Math.sin(t) * rw, 0, tmp); if (a) ctx.lineTo(tmp.x, tmp.y); else ctx.moveTo(tmp.x, tmp.y); }
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
      const col = f.o.color || '#2f6fb6';
      switch (f.kind) {
        case 'ripple': {
          for (let r = 0; r < 2; r++) {
            const kk = U.clamp(k * 1.3 - r * 0.3, 0, 1); if (kk <= 0 || kk >= 1) continue;
            ctx.globalAlpha = (1 - kk) * 0.85; ctx.strokeStyle = col; ctx.lineWidth = 3.2 * (1 - kk) + 0.8;
            this.fxRing(ctx, f.x, f.y, (6 + (1 - Math.pow(1 - kk, 3)) * 34) / z); ctx.stroke();
          }
          break;
        }
        case 'burst': {
          const p = this.P(f.x, f.y, 0, tmp), px = p.x, py = p.y;
          ctx.globalAlpha = (1 - k) * 0.9; ctx.strokeStyle = col; ctx.lineWidth = 3 * (1 - k) + 1;
          this.fxRing(ctx, f.x, f.y, (8 + e * 46) / z); ctx.stroke();
          ctx.globalAlpha = (1 - k) * 0.35; ctx.fillStyle = col; this.fxRing(ctx, f.x, f.y, (6 + e * 18) / z); ctx.fill();
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
          for (let q = 0; q < n; q++) { this.P(pts[q][0], pts[q][1], 0, tmp); if (q) ctx.lineTo(tmp.x, tmp.y); else ctx.moveTo(tmp.x, tmp.y); }
          const fade = k > 0.65 ? 1 - (k - 0.65) / 0.35 : 1;
          ctx.globalAlpha = 0.55 * fade; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = this.lineWidthPx() + 9; ctx.stroke();
          ctx.globalAlpha = 0.9 * fade; ctx.strokeStyle = col; ctx.lineWidth = this.lineWidthPx() + 3; ctx.stroke();
          const hd = pts[n - 1]; this.P(hd[0], hd[1], 0, tmp);
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
    this.displayedLevel = this.requestedLevel = null;
    this.clearImages(); this.overview = null; this.overviewJob = null; this.overviewStale = true; this.heat = null; this.heatKey = '';
    this.heatLayers.clear(); this.segScreens = new WeakMap(); this.segDecos = new WeakMap(); this.metroOrder = null;
    this.roadLabelGeom = new WeakMap(); this.textWidths.clear(); this._cgBmp = null;
    this.geoPaths = new WeakMap(); this.labelImage = null;
    this._hd = null; this._hdCity = null; this._lmc = null; this._lmcCity = null;
    this.lastFrameMs = null; this.detail = { tier: 0, ema: 8, busy: 0, calm: 0 };
    this.roadVer = g ? g.city.roadVersion : -1;
    // 换城市（含换地图）时清掉按城市版本号缓存的数据，避免不同城市的版本号恰好相同
    this.linkGrid = null; this.linkGridVer = -1; this._cgIdx = null; this._cgRuns = null; this._fa = null; this._fl = null; this._flKey = null;
    this._flLay = null; this._flLayKey = null; this._flShow = null; this._sf = null; this._sfKey = null; this._rm = {}; this.hl = null; this.follow = null;
    this._rk = null; this.styleEpoch = g ? Math.floor(g.clock.y / 5) : null; this.styleYear = g ? this.styleEpoch * 5 : null;
  };
  // 切换主题：重建地面与建筑缓存（总览图立即重绘，避免空白）
  Renderer.prototype.setTheme = function (name) {
    TH = THEMES[name] || THEMES.light; GROUND = TH.ground; PAL = TH.pal;
    this.th = TH; this.themeName = name;
    this.displayedLevel = this.requestedLevel = null;
    this.clearImages(); this.heatKey = ''; this._cgBmp = null;
    if (this.game) this.renderOverview(); else this.overviewStale = true;
  };
  Renderer.prototype.resize = function () {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = window.innerWidth, h = window.innerHeight;
    if (w === this.w && h === this.h && dpr === this.dpr) return;
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
  Renderer.prototype.unproject = function (sx, sy) {
    const M = this.M, a = (sx - this.ox) / this.z, b = (sy - this.oy) / this.z;
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
      const f = c.fly; f.t = Math.min(1, f.t + dt / 0.65);
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
    if (this.styleEpoch !== ep) {
      this.styleEpoch = ep; this.styleYear = ep * 5;
      this.ground.forEach(function (e) { e.stale = true; });
      this.iso.forEach(function (e, k) { if (k.charAt(0) !== 'L') e.stale = true; });
    }
    if (city.roadVersion !== this.roadVer) {
      this.roadVer = city.roadVersion;
      this.ground.forEach(function (e) { e.stale = true; });
      this.overviewStale = true;
    }
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
  Renderer.prototype.evict = function () {
    if (this.cachePx <= CFG.perf.cacheMaxPx) return;
    const all = [];
    this.ground.forEach(function (e, k) { all.push([e, k, 'g']); });
    this.iso.forEach(function (e, k) { all.push([e, k, 'i']); });
    all.sort(function (a, b) { return a[0].used - b[0].used; });
    for (const it of all) {
      if (this.cachePx <= CFG.perf.cacheMaxPx * 0.8) break;
      if (it[0].used >= this.frame) continue;
      (it[2] === 'g' ? this.ground : this.iso).delete(it[1]);
      this.cachePx -= it[0].px;
      it[0].cv.width = it[0].cv.height = 1;
    }
  };
  function makeCanvas(w, h) { const c = document.createElement('canvas'); c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h)); return c; }

  // ---------------- 地面绘制（世界坐标） ----------------
  // 格内单位坐标 (u,v) → 世界坐标
  Renderer.prototype.quadPt = function (i, j, u, v) {
    const city = this.game.city, VW = city.VW, vx = city.vx, vy = city.vy;
    const a = j * VW + i, b = a + 1, c = a + VW + 1, d = a + VW;
    const x = (vx[a] * (1 - u) + vx[b] * u) * (1 - v) + (vx[d] * (1 - u) + vx[c] * u) * v;
    const y = (vy[a] * (1 - u) + vy[b] * u) * (1 - v) + (vy[d] * (1 - u) + vy[c] * u) * v;
    return [x, y];
  };
  // 单格建筑（单位坐标 u,v ∈ [0,1]，高度为米）：在 4×4 子地块上稀疏布置，避开真实道路、铁路与水面。
  // 风格上以少量玻璃塔楼与低层体量为主；coarse=true（远景）时只保留较高的建筑。
  Renderer.prototype.cellBuildings = function (c, coarse) {
    const city = this.game.city, L = city.lu[c];
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
    for (let j = j0; j < j1; j++) {
      for (let i = i0; i < i1; i++) {
        const c = j * W + i, L = city.lu[c];
        let col;
        if (L === LU.WATER) col = GROUND.farm[0];
        else if (L === LU.HILL) col = GROUND.hill[Math.floor(U.noise2(i * 0.35, j * 0.35, 5) * 3) % 3];
        else if (L === LU.AIRPORT) col = GROUND.airport;
        else if (city.street[c] && L !== LU.PARK) col = GROUND.urban[L] || GROUND.urban[0];
        else col = GROUND.farm[Math.floor(U.hash2(i >> 1, j >> 1, 3) * 3)];
        P(col).rect(i - px, j - px, 1 + 2 * px, 1 + 2 * px);
      }
    }
    paths.forEach(function (p, col) { ctx.fillStyle = col; ctx.fill(p); });
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
    ctx.fill(wp, 'evenodd');
    // 风景区山体：雾蓝绿色
    // 逐个填充：风景区内常有嵌套的子景区，合在一条路径里用奇偶规则会互相抵消成空洞
    ctx.fillStyle = GROUND.hill[0]; ctx.globalAlpha = 0.85;
    for (const f of Geo.reserves) if (inBox(f.bbox, 0.5)) ctx.fill(this.featurePath(f, true), 'evenodd');
    ctx.globalAlpha = 1;
    // 公园（真实范围）
    const pp = new Path2D();
    for (const f of Geo.parks) if (inBox(f.bbox, 0.5)) pp.addPath(this.featurePath(f, true));
    ctx.fillStyle = GROUND.park; ctx.fill(pp, 'evenodd');
    if (lvl >= 16) { ctx.strokeStyle = GROUND.parkEdge; ctx.lineWidth = px * 1.2; ctx.stroke(pp); }
    // 旧机场跑道
    const ab = city.airportBox;
    const rw = D.airport && D.airport.runway;
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
    // 水系（真实岸线）
    const wpth = new Path2D();
    for (const f of Geo.water) if (inBox(f.bbox, 0.5)) wpth.addPath(this.featurePath(f, true));
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    // 历史海岸线：尚未填海成陆的区域仍画成水面（单独以 nonzero 填充，避免与海域多边形的奇偶规则抵消）
    const rpth = new Path2D(); let anyRc = false;
    for (const f of city.reclaimFeats ? city.reclaimFeats(true) : []) if (inBox(f.bbox, 0.5)) { const path = this.featurePath(f, true); rpth.addPath(path); wpth.addPath(path); anyRc = true; }
    ctx.strokeStyle = GROUND.bank; ctx.lineWidth = Math.max(0.05, px * 2.4); ctx.stroke(wpth);
    ctx.fillStyle = GROUND.water; ctx.fill(wpth, 'evenodd');
    if (anyRc) ctx.fill(rpth, 'nonzero');
    // 水面波纹（近景）
    if (lvl >= 16) {
      ctx.save(); ctx.clip(wpth, 'evenodd');
      ctx.strokeStyle = GROUND.glint; ctx.lineWidth = px * 1.2;
      ctx.beginPath();
      for (let j = Math.floor(Y0); j < Y1; j += 0.7) for (let i = Math.floor(X0); i < X1; i += 1.3) {
        const hx = U.hash2(Math.round(i * 10), Math.round(j * 10), 17); if (hx > 0.35) continue;
        const x = i + hx * 1.5, y = j + U.hash2(Math.round(i * 10), Math.round(j * 10), 18) * 0.5;
        ctx.moveTo(x, y); ctx.lineTo(x + 0.35, y - 0.06);
      }
      ctx.stroke(); ctx.restore();
    }
    for (const l of Geo.waterLines) {
      if (!inBox(l.bbox, 0.5)) continue;
      ctx.strokeStyle = GROUND.water; ctx.lineWidth = Math.max(l.w, px * 1.5);
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
      ctx.fillStyle = TH.shadow2d; ctx.fill(shadow);
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
    // 未开放区域
    const lock = new Path2D(); let anyLock = false;
    for (let j = j0; j < j1; j++) for (let i = i0; i < i1; i++) {
      const c = j * W + i;
      const rg = city.regions[city.region[c]];
      if (city.regionOpen[city.region[c]] || rg.scenic || city.lu[c] === LU.WATER) continue;
      lock.rect(i - px, j - px, 1 + 2 * px, 1 + 2 * px); anyLock = true;
    }
    if (anyLock) {
      ctx.save();
      ctx.clip(lock);
      // 只覆盖陆地：沿岸的格按真实岸线裁掉水面，避免锯齿状的斜线压在江面上
      const land = new Path2D(); land.rect(X0 - 1, Y0 - 1, X1 - X0 + 2, Y1 - Y0 + 2); land.addPath(wpth);
      ctx.clip(land, 'evenodd');
      ctx.fillStyle = TH.lockFill; ctx.fillRect(X0, Y0, X1 - X0, Y1 - Y0);
      ctx.strokeStyle = TH.lockHatch; ctx.lineWidth = Math.max(px, 0.04);
      ctx.beginPath();
      for (let k = Math.floor((X0 + Y0) / 0.6) * 0.6; k < X1 + Y1; k += 0.6) { ctx.moveTo(k - Y0, Y0); ctx.lineTo(k - Y1, Y1); }
      ctx.stroke();
      ctx.restore();
    }
  };
  // 地标占地（2D 平面）：真实场地范围 + 主体建筑轮廓
  Renderer.prototype.drawLandmark2D = function (ctx, lm, lvl) {
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
      case 'stadium':
        rect(-hw, -hd, hw, hd, lm.w > 500 ? lawn : plaza, false);
        if (lm.w > 500) {
          poly(ngon(0, -70, 150, 36, 0, 125), N ? '#3b4250' : '#eceee9'); poly(ngon(0, -70, 108, 36, 0, 90), '#c8644a', false); poly(ngon(0, -70, 90, 36, 0, 75), '#7dbb62', false);
          poly(ngon(-270, 170, 70, 20, 0, 52), N ? '#3b4250' : '#e2e5e9'); rect(200, 125, 340, 210, N ? '#33475c' : '#cfe2ef');
        } else { poly(ngon(0, 0, hw * 0.95, 30, 0, hd * 0.95), N ? '#3b4250' : '#eceee9'); poly(ngon(0, 0, hw * 0.7, 30, 0, hd * 0.7), '#7dbb62', false); }
        break;
      case 'tvtower': poly(ngon(0, 0, 40, 24, 0, 30), N ? '#4a3f66' : '#b9bec6'); poly(ngon(0, 0, 26, 24, 0, 19), N ? '#2b2840' : '#d5d9df', false); poly(ngon(0, 0, 10, 12), N ? '#d07ae0' : '#646a74', false); break;
      case 'lattice':
        if (lm.style === 'skytree') { rect(-hw, -hd, hw, hd, plaza, false); poly(ngon(0, 0, 39, 3, -Math.PI / 2), N ? '#3e4a5e' : '#dfe5ec'); poly(ngon(0, 0, 17, 18), N ? '#6fa8e0' : '#a9b3bf', false); }
        else { rect(-hw, -hd, hw, hd, plaza, false); rect(-45, -30, 45, 30, N ? '#4a4f5a' : '#e4e1da'); for (const a of [-1, 1]) for (const b of [-1, 1]) rect(a * 40 - 6, b * 40 - 6, a * 40 + 6, b * 40 + 6, '#d2452f'); rect(-8, -8, 8, 8, '#d2452f', false); }
        break;
      case 'pagoda': rect(-hw, -hd, hw, hd, plaza, false); rect(-77, -32, -23, -12, '#6f6d6a'); rect(-77, 2, -23, 22, '#6f6d6a'); poly(ngon(30, 0, 11, 8, Math.PI / 8), '#cfa96b'); break;
      case 'minaret': rect(-hw, -hd, hw, hd, plaza, false); rect(-40, -20, 2, 18, '#9aa7ad'); poly(ngon(22, 0, 5, 12), '#e2dccd'); break;
      case 'tower': rect(-18, -13, 18, 13, '#b5402f'); break;
      case 'church': rect(-hw, -hd, hw, hd, plaza, false); rect(-50, -16, 20, 16, '#9a9890'); rect(20, -17, 32, -5, '#7a786f'); rect(20, 5, 32, 17, '#7a786f'); break;
      case 'colonial':
        rect(-hw, -hd, hw, hd, lm.w > 500 ? (N ? '#22382a' : '#d8e8c8') : plaza, false);
        if (lm.w > 500) { for (let r = 0; r < 2; r++) for (let k = 0; k < 9; k++) { if (r === 1 && k === 0) continue; const u0 = -hw + 40 + k * (lm.w - 140) / 9, v0 = [-80, 50][r]; rect(u0, v0, u0 + 52, v0 + 46, '#e6c98a'); } rect(-hw + 10, 95, -hw + 150, 140, N ? '#5a6070' : '#f4f4f0'); }
        else { rect(-60, -60, 60, -44, '#d9cfbb'); rect(-60, 44, 60, 60, '#d9cfbb'); rect(-60, -44, -44, 44, '#d9cfbb'); rect(44, -44, 60, 44, '#d9cfbb'); }
        break;
      case 'traditional': case 'temple': rect(-hw, -hd, hw, hd, plaza, false); rect(-hw + 4, -hd + 4, hw - 4, hd - 4, null); break;
      case 'rail':
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
      case 'box': rect(-hw, -hd, hw, hd, plaza, false); rect(-58, -58, 58, 58, N ? '#40424a' : '#8e8e94'); break;
      case 'concert': poly([T(-58, -26), T(56, -38), T(48, 36), T(-52, 30)], N ? '#5a6474' : '#eef0f2'); break;
      case 'gallery': poly(ngon(0, 0, 46, 5, -Math.PI / 2), N ? '#4a5262' : '#f4f4f2'); break;
      default: rect(-hw * 0.8, -hd * 0.8, hw * 0.8, hd * 0.8, bld);
    }
    ctx.restore();
  };
  Renderer.prototype.renderGroundChunk = function (lvl, ci, cj) {
    const C = CHUNK_PX / lvl, x0 = ci * C, y0 = cj * C;
    const cv = makeCanvas(CHUNK_PX + 2, CHUNK_PX + 2), ctx = cv.getContext('2d');
    ctx.setTransform(lvl, 0, 0, lvl, -x0 * lvl + 1, -y0 * lvl + 1);
    this.drawGround(ctx, x0 - 1 / lvl, y0 - 1 / lvl, x0 + C + 1 / lvl, y0 + C + 1 / lvl, lvl);
    return cv;
  };
  Renderer.prototype.renderOverview = function () {
    const lvl = 4, cv = makeCanvas(CFG.W * lvl, CFG.H * lvl), ctx = cv.getContext('2d');
    ctx.fillStyle = GROUND.land; ctx.fillRect(0, 0, cv.width, cv.height);
    ctx.fillStyle = GROUND.water;
    const city = this.game.city;
    for (let c = 0; c < city.N; c++) if (city.lu[c] === LU.WATER) ctx.fillRect((c % city.W) * lvl, ((c / city.W) | 0) * lvl, lvl, lvl);
    this.overview = cv; this.overviewStale = false; this.overviewAt = performance.now();
    this.overviewJob = { cv: cv, row: 0, version: city.version };
  };
  Renderer.prototype.stepOverview = function () {
    const job = this.overviewJob;
    if (!job) return;
    const y0 = job.row, y1 = Math.min(CFG.H, y0 + 4), ctx = job.cv.getContext('2d');
    ctx.save(); ctx.setTransform(4, 0, 0, 4, 0, 0); ctx.beginPath(); ctx.rect(0, y0, CFG.W, y1 - y0); ctx.clip();
    this.drawGround(ctx, 0, y0, CFG.W, y1, 4); ctx.restore();
    job.row = y1;
    if (y1 >= CFG.H) { this.overviewJob = null; this.overviewAt = performance.now(); this.overviewStale = job.version !== this.game.city.version; }
  };

  // ---------------- 等距建筑分块 ----------------
  Renderer.prototype.isoChunkGeom = function (lvl, ci, cj) {
    const C = CHUNK_PX / lvl / 1.41421356 | 0 || 1;
    return C;
  };
  Renderer.prototype.renderIsoChunk = function (lvl, ci, cj, C) {
    const gen = this.isoChunkGen(lvl, ci, cj, C);
    for (;;) { const r = gen.next(); if (r.done) return r.value; }
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
        if (L === LU.HILL) { drew += this.isoPeak(ctx, pj, c, i, j, s); continue; }
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
    let e = this.iso.get(key);
    if (e && !e.stale) { e.used = this.frame; return e; }
    const lm = D.landmarks[k], s = lvl;
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
    e = { cv: cv, ax: (lm.x - lm.y) * ISO[0] * s + ox, ay: (lm.x + lm.y) * ISO[2] * s + oy, px: cv.width * cv.height, used: this.frame, born: this.time, stale: false };
    const old = this.iso.get(key); if (old) this.cachePx -= old.px;
    this.iso.set(key, e); this.cachePx += e.px;
    return e;
  };
  // ---------- 等距几何辅助：任意凸多边形棱柱、棱锥、椭圆 ----------
  function polyRect(x0, y0, x1, y1) { return [[x0, y0], [x1, y0], [x1, y1], [x0, y1]]; }
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
      fillPts(ctx, q, U.rgb(U.shade(wall, fc.f)));
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
    old: { cn: [[226, 229, 233], [219, 223, 229], [231, 232, 234]], hk: [[236, 234, 228], [228, 235, 233], [236, 231, 230], [229, 231, 238]], jp: [[234, 231, 225], [227, 226, 222], [237, 234, 228]], tw: [[229, 232, 236], [222, 227, 233], [232, 232, 231]] },
    roof: { cn: [184, 194, 208], hk: null, jp: [176, 187, 202], tw: null },
    masonry: [[233, 229, 220], [227, 224, 216], [236, 233, 226]],
    slab: [[232, 235, 239], [226, 231, 237], [236, 238, 240], [222, 228, 236]],
    tile: [[236, 240, 245], [228, 235, 243], [240, 242, 245]],
  };
  const NEON_YEAR = { cn: 1992, hk: 1960, jp: 1955, tw: 1975 };
  const NEON_COL = ['#ff4fa3', '#36e0ff', '#ffd23f', '#7cff6b', '#ff6a3d', '#b98cff'];
  const REGION_KEY = { '中国内地': 'cn', '中国香港': 'hk', '中国台湾': 'tw', '日本': 'jp', '英国': 'uk' };
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
    if (age > 30 && U.hash2(c, k, 19) < (age - 30) / 50) v = Y - 25 * U.hash2(c, k, 20);
    return Math.min(v, Y);
  };
  Renderer.prototype.bldStyle = function (c, k, h) {
    const v = this.bldVintage(c, k, h);
    if (v < 1960) return h <= 24 ? 'old' : 'masonry';
    if (v < 1990) return 'slab';
    if (v < 2005) return 'tile';
    return 'glass';
  };
  // 平面图（2D）中的建筑颜色：与 2.5D 同一风格，坡屋顶建筑显示屋面颜色
  Renderer.prototype.bldTopColor = function (c, k, b) {
    const st = this.bldStyle(c, k, b[4]), rk = this._rk || (this._rk = this.regionKey());
    if (st === 'glass') { const pal = PAL[b[5]] || PAL[0]; return pal[Math.floor(U.hash2(c, k, 4) * pal.length)]; }
    let col;
    if (st === 'old' && b[4] <= 20 && STYLE_PAL.roof[rk]) col = U.mixc(STYLE_PAL.roof[rk], [226, 231, 237], 0.35);
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
  // 立面上的一条水平线（两个可见立面）
  function faceBand(ctx, pj, B, C, D, hh) {
    const p0 = pj(D[0], D[1], hh), p1 = pj(C[0], C[1], hh), p2 = pj(B[0], B[1], hh);
    ctx.moveTo(p0[0], p0[1]); ctx.lineTo(p1[0], p1[1]); ctx.lineTo(p2[0], p2[1]);
  }
  // 建筑体量：两个立面 + 顶面（或坡屋顶）；按年代风格加窗带、玻璃竖条、檐口；高楼带高光；夜间少量暖色窗光与商业霓虹
  Renderer.prototype.isoBox = function (ctx, pj, i, j, b, c, k, s) {
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
      const so = Math.min(1.0, h * 0.45);
      const Cs = pj(C[0] + so, C[1] - so * 0.2, 0), Bs = pj(B[0] + so, B[1] - so * 0.2, 0);
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
    const roof = st === 'old' && mh <= 20 && STYLE_PAL.roof[rk];
    if (roof) pitchedRoof(ctx, pj, A, B, C, Dd, h, base, TH.night ? nightCol(roof) : roof);
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
    if (b[5] === LU.COM && mh >= 15 && s >= 16 && (this.styleYear || 0) >= NEON_YEAR[rk] && U.hash2(c, k, 33) < 0.7) {
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
    const hm = (60 + 320 * m) * (0.55 + 0.75 * U.hash2(c, 4, 44));
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
    const N = TH.night, CMM = CFG.CELL_M, kind = lm.kind, detail = true;
    const ang = (lm.rot || 0) * Math.PI / 180, ca = Math.cos(ang), sa = Math.sin(ang);
    const T = function (u, v) { return [lm.x + (u * ca - v * sa) / CMM, lm.y + (u * sa + v * ca) / CMM]; };
    const tall = kind === 'tvtower' || kind === 'skyscraper' || kind === 'lattice';
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
    switch (kind) {
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
      case 'museum': { // 南越王墓博物馆：红砂岩阶梯体量与覆斗形墓室
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
      case 'campus': { // 校园标志建筑（其余校舍由街区建筑生成）
        const brick = [180, 92, 70], tile = [80, 124, 98];
        if (lm.id === 'sysu') { // 怀士堂：红砖钟楼礼堂
          box(-24, -12, 24, 12, 0, 12, brick, null); hip(-26, -14, 26, 14, 12, 18, tile);
          box(-6, -20, 6, -8, 0, 26, brick, null); hip(-7, -21, 7, -7, 26, 32, tile);
          lit(-24, 12, 24, 12, 2, 10, 2, 6);
        } else if (lm.id === 'scut') { // 华工一号楼：宫殿式教学楼
          box(-40, -10, 40, 10, 0, 16, [214, 204, 180], null); hip(-43, -13, 43, 13, 16, 24, [70, 120, 96]);
          box(-12, -14, 12, 14, 0, 20, [214, 204, 180], null); hip(-14, -16, 14, 16, 20, 28, [70, 120, 96]);
          lit(-40, 10, 40, 10, 2, 14, 3, 10);
        } else { // 暨南大学：现代礼堂与校门
          box(-30, -22, 30, 22, 0, 14, white, U.shade(white, 1.04)); cyl(0, 0, 16, 16, 14, 20, N ? [110, 130, 160] : [170, 196, 222]);
          lit(-30, 22, 30, 22, 2, 12, 2, 8);
        }
        break;
      }
      case 'rail': { // 广州站：长条站房 + 中央钟楼 + 站台雨棚；广州东站：大跨度方形站房
        const body = N ? [86, 92, 104] : [226, 226, 230];
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
        // 白天：中灰立柱与斜撑、深灰圆环、深灰混凝土核心筒、灰色桅杆（顶部红色航空障碍灯）；夜间：结构内嵌的彩色 LED 灯光
        const H = 454, rings = 26, nv = 24, tw = 280 / H;
        // 双曲面外筒：底部椭圆约 80 × 60 m，280 m 处收腰约 27 × 21 m，顶部约 54 × 41 m
        const radius = function (t) { const d = t - tw; return { rx: Math.sqrt(13.5 * 13.5 + 3692 * d * d), ry: Math.sqrt(10.5 * 10.5 + 2057 * d * d) }; };
        const b = pj(lm.x, lm.y, 0), top = pj(lm.x, lm.y, H * E);
        ctx.fillStyle = TH.isoShadow; ctx.beginPath(); ctx.ellipse(b[0], b[1], 70 / CMM * s, 30 / CMM * s, 0, 0, Math.PI * 2); ctx.fill();
        cyl(0, 0, 7, 12, 0, H * 0.98, N ? [40, 38, 54] : [92, 98, 108], null, 0, 8.5);   // 椭圆核心筒约 14 × 17 m
        let col, brace, ringCol;
        if (N) {
          const gr = ctx.createLinearGradient(b[0], b[1], top[0], top[1]);
          gr.addColorStop(0, 'rgba(255,72,150,0.95)'); gr.addColorStop(0.45, 'rgba(196,92,255,0.95)'); gr.addColorStop(1, 'rgba(84,176,255,0.95)');
          col = gr; brace = gr; ringCol = 'rgba(255,214,246,0.55)';
        } else { col = 'rgba(128,135,146,0.95)'; brace = 'rgba(128,135,146,0.55)'; ringCol = 'rgba(88,95,106,0.85)'; }
        const strand = function (a0, twist, style, lw) {
          ctx.strokeStyle = style; ctx.lineWidth = lw; ctx.beginPath();
          for (let q = 0; q <= rings; q++) {
            const t = q / rings, a = a0 + t * twist, r = radius(t);
            if (Math.cos(a) + Math.sin(a) < -0.3) { ctx.stroke(); ctx.beginPath(); continue; }
            const w = T(Math.cos(a) * r.rx, Math.sin(a) * r.ry), p = pj(w[0], w[1], H * t * E);
            if (q) ctx.lineTo(p[0], p[1]); else ctx.moveTo(p[0], p[1]);
          }
          ctx.stroke();
        };
        const lw = Math.max(1.1, s / 34);
        for (let v = 0; v < nv; v++) strand(v / nv * Math.PI * 2, Math.PI * 0.9, col, lw);          // 24 根倾斜立柱
        if (s >= 16) for (let v = 0; v < nv; v += 2) strand(v / nv * Math.PI * 2, -Math.PI * 0.55, brace, lw * 0.7); // 反向斜撑
        ctx.strokeStyle = ringCol; ctx.lineWidth = lw;
        for (let q = 1; q <= rings; q += 2) { const t = q / rings, r = radius(t); ctx.beginPath(); for (let a = -0.8; a <= 2.4; a += 0.2) { const w = T(Math.cos(a) * r.rx, Math.sin(a) * r.ry), p = pj(w[0], w[1], H * t * E); if (a > -0.8) ctx.lineTo(p[0], p[1]); else ctx.moveTo(p[0], p[1]); } ctx.stroke(); }
        // 顶部观光层圆环
        { const r = radius(1); ctx.strokeStyle = N ? 'rgba(255,236,250,0.9)' : 'rgba(176,182,192,0.95)'; ctx.lineWidth = lw * 1.6; ctx.beginPath(); for (let a = 0; a <= Math.PI * 2 + 0.01; a += 0.25) { const w = T(Math.cos(a) * r.rx, Math.sin(a) * r.ry), p = pj(w[0], w[1], H * E); if (a > 0) ctx.lineTo(p[0], p[1]); else ctx.moveTo(p[0], p[1]); } ctx.stroke(); }
        line(0, 0, H, 0, 0, 600, N ? '#f4dcff' : '#8e949c', Math.max(1.2, s / 26));
        line(0, 0, 540, 0, 0, 600, N ? '#ffffff' : '#a6acb4', Math.max(0.8, s / 40));
        dot(0, 0, 600, Math.max(1.2, s / (N ? 24 : 34)), N ? '#ff4d6d' : '#e0403a');
        break;
      }
      case 'lattice': { // 钢结构电波塔：东京塔（国际橙/白相间桁架）与东京晴空塔（三角底座渐变为圆形的白色桁架）
        const b = pj(lm.x, lm.y, 0);
        ctx.fillStyle = TH.isoShadow; ctx.beginPath(); ctx.ellipse(b[0], b[1], 60 / CMM * s, 26 / CMM * s, 0, 0, Math.PI * 2); ctx.fill();
        const lw = Math.max(0.8, s / 40);
        // 正对观察者的立面：世界方向 (1,1)
        const front = function (u, v) { return (u * ca - v * sa) + (u * sa + v * ca) > -0.1; };
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
        } else { // 东塔：方形分段收分，白色竖向陶板（其他城市的超高层按高度与占地等比缩放）
          const kh = H / 530, kw = Math.min(1.2, (lm.w || 78) / 78);
          const tiers = [[38, 0, 160], [36, 160, 330], [33, 330, 470], [29, 470, 515]];
          for (const t of tiers) box(-t[0] * kw, -t[0] * 0.9 * kw, t[0] * kw, t[0] * 0.9 * kw, t[1] * kh, t[2] * kh, N ? [80, 92, 112] : [214, 222, 230], null, { lines: function (fc, q) { if (s < 16) return; ctx.strokeStyle = N ? 'rgba(255,214,140,0.4)' : 'rgba(255,255,255,0.75)'; ctx.lineWidth = 1; ctx.beginPath(); for (let k = 0.08; k < 1; k += 0.14) { ctx.moveTo(q[0][0] + (q[1][0] - q[0][0]) * k, q[0][1] + (q[1][1] - q[0][1]) * k); ctx.lineTo(q[3][0] + (q[2][0] - q[3][0]) * k, q[3][1] + (q[2][1] - q[3][1]) * k); } ctx.stroke(); } });
          box(-22 * kw, -20 * kw, 22 * kw, 20 * kw, 515 * kh, H, N ? [110, 120, 140] : [196, 204, 214]);
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
        box(-40, -40, 40, 40, 0, 7, N ? [60, 64, 72] : [120, 124, 130], null);
        box(-58, -58, 58, 58, 7, 42, N ? [70, 72, 80] : [96, 96, 100], N ? [90, 92, 100] : [150, 150, 156], { lines: function (fc, q) { if (s < 16) return; ctx.strokeStyle = N ? 'rgba(220,180,90,0.35)' : 'rgba(220,200,160,0.5)'; ctx.lineWidth = 1; ctx.beginPath(); for (let t = 0.12; t < 1; t += 0.18) { ctx.moveTo(q[0][0] + (q[3][0] - q[0][0]) * t, q[0][1] + (q[3][1] - q[0][1]) * t); ctx.lineTo(q[1][0] + (q[2][0] - q[1][0]) * t, q[1][1] + (q[2][1] - q[1][1]) * t); } ctx.stroke(); } });
        break;
      }
      case 'library': { // 广州图书馆：“之”字形层叠
        const c1 = N ? [96, 100, 112] : [206, 200, 188];
        box(-62, -36, 10, 36, 0, 26, c1, null); box(-10, -36, 62, 36, 26, 50, c1);
        box(-62, -36, 10, 36, 26, 28, U.shade(c1, 0.9)); lit(-62, 36, 10, 36, 3, 24, 4, 8); lit(-10, 36, 62, 36, 28, 48, 4, 8);
        break;
      }
      case 'mall': { // 天河城：商业裙楼
        box(-hw + 10, -hd + 10, hw - 10, hd - 10, 0, 32, N ? [86, 92, 110] : [224, 218, 206], null);
        lit(-hw + 10, hd - 10, hw - 10, hd - 10, 3, 30, 6, 14);
        box(-30, -30, 30, 30, 32, 40, N ? [110, 120, 140] : [196, 210, 224]);
        break;
      }
      case 'conference': { // 白云国际会议中心：彩色竖向遮阳板
        box(-hw + 20, -hd + 30, hw - 20, hd - 30, 0, 36, N ? [86, 92, 106] : [226, 226, 222], null, { lines: function (fc, q) { if (s < 16) return; const cols = ['#d94f3d', '#f0a72b', '#2f6fb6', '#16a085', '#8e44ad']; for (let k = 0; k < 14; k++) { const t = (k + 0.5) / 14; ctx.strokeStyle = cols[k % 5]; ctx.lineWidth = Math.max(1, s / 30); ctx.beginPath(); ctx.moveTo(q[0][0] + (q[1][0] - q[0][0]) * t, q[0][1] + (q[1][1] - q[0][1]) * t); ctx.lineTo(q[3][0] + (q[2][0] - q[3][0]) * t, q[3][1] + (q[2][1] - q[3][1]) * t); ctx.stroke(); } } });
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
    const dyn = lay === 'fac' || lay === 'gap';
    const key = lay + ':' + city.version + ':' + g.clock.y + ':' + g.clock.m + ':' + (lay === 'cover' ? g.netVersion + ':' + LO.cover : '') + (lay === 'fac' ? LO.facP + ':' + LO.facDt : '') + (lay === 'gap' ? LO.gapDt + ':' + g.netVersion : '') + (dyn ? ':' + model.cycles + ':' + (model.settled ? 's' : '') : '');
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
    const fd = dyn ? model.facData(lay === 'gap' ? LO.gapDt : LO.facDt) : null;
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
    const stCol = function (k) { const hsh = (k * 2654435761) >>> 0; return [40 + (hsh & 127), 110 + ((hsh >> 7) & 100), 60 + ((hsh >> 14) & 140)]; };
    for (let c = 0; c < W * H; c++) {
      let col = null, a = 0;
      const p = city.pop[c] / 0.0625, jb = city.jobs[c] / 0.0625;
      if (lay === 'fac') {
        if (facCell) { const v = facCell[c] / 0.0625; if (v > 150) { const t = U.clamp(Math.sqrt(v / 40000), 0, 1); col = U.hex2rgb(TR.color[PK[facDom[c]]] || '#888888'); a = 0.1 + 0.42 * t; } }
      } else if (lay === 'gap') {
        if (gapCell) { const v = gapCell[c] / 0.0625; if (v > 400) { const t = U.clamp(Math.sqrt(v / 60000), 0, 1); col = U.ramp([[0, [255, 214, 170]], [0.5, [236, 112, 72]], [1, [180, 24, 34]]], t); a = 0.12 + 0.45 * t; } }
      } else if (lay === 'cover' && LO.cover === 'station') {
        const w = acc ? acc.cellWalk[c] : Infinity, k = acc ? acc.cellStation[c] : -1;
        if (k >= 0 && w <= CFG.walk.maxAccessM) { col = stCol(k); a = 0.42 - 0.18 * U.clamp(w / CFG.walk.maxAccessM, 0, 1); }
        else if (p > 4000) { col = [215, 48, 39]; a = U.clamp(0.1 + p / 120000, 0, 0.38); }
      } else if (lay === 'pop') {
        // 浅色单色渐变、半透明（最高约 0.5），道路与地名仍清楚可见
        if (p > 200) { const t = U.clamp(Math.sqrt(p / 60000), 0, 1); col = U.ramp([[0, [255, 226, 150]], [0.5, [249, 158, 76]], [1, [222, 84, 52]]], t); a = 0.12 + 0.4 * t; }
      } else if (this.layer === 'jobs') {
        const t = p + jb;
        if (t > 300) { const sh = p / t; col = U.mixc([52, 104, 214], [240, 150, 60], sh); a = U.clamp(0.12 + 0.4 * Math.sqrt(t / 90000), 0, 0.5); }
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
        else if (!city.regionOpen[city.region[c]]) { col = [150, 150, 150]; a = 0.25; }
      }
      if (col) { const o = c * 4; d[o] = col[0]; d[o + 1] = col[1]; d[o + 2] = col[2]; d[o + 3] = a * 255; }
    }
    ctx.putImageData(img, 0, 0);
    this.heatLayers.set(this.layer, { key: key, access: access, cv: this.heat });
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
    if (this.overviewStale && !this.overviewJob && (!this.overview || performance.now() - this.overviewAt > 600)) this.renderOverview();
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
        const k = e.key.split(':');
        const x0 = +k[1] * C2, y0 = +k[2] * C2;
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
    if (layerOn && ['pop', 'jobs', 'cover', 'region', 'fac', 'gap'].indexOf(this.layer) >= 0) {
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
    if (this.layerFade > 0.01 && (this.layer === 'cong' || this.layer === 'flow' || this.layer === 'station' || !layerOn)) {
      ctx.fillStyle = U.rgb(TH.fog || TH.bg, 0.5 * this.layerFade); ctx.fillRect(0, 0, this.w, this.h);
    }
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
      const buckets = agents && agentAlpha > 0 ? agents.bucket(C) : null;
      const sc = z / ilvl;
      // 地标按其中心所在分块归组，在该分块之后绘制（与前后建筑正确遮挡）
      const city = this.game.city, lmBy = new Map();
      for (let k = 0; k < D.landmarks.length; k++) {
        if (!city.landmarkOn[k]) continue;
        const lm = D.landmarks[k], kk = Math.floor(lm.x / C) + ':' + Math.floor(lm.y / C);
        let l = lmBy.get(kk); if (!l) { l = []; lmBy.set(kk, l); } l.push(k);
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
    this.drawMetro(ctx, ui);
    if (agents) agents.drawTrains(ctx, this, ui);
    if (this.layer === 'station') this.drawStationFlows(ctx);
    if (this.layer === 'gap') this.drawGapOverload(ctx);
    if (this.layer === 'fac' || this.layer === 'gap') this.drawFacilities(ctx);
    if (this.fx.length) this.drawFx(ctx, dt);
    if (under < 0.5) this.drawAtmosphere(ctx);
    // ---- 标注 ----
    this.drawLabels(ctx, ui);
    if (this.hl) this.drawHighlight(ctx);
    if (ui && ui.drawOverlay) ui.drawOverlay(ctx, this);
    // ---- 缓存渲染队列 ----
    if (this.isoJob) {
      const active = queue.find((q) => q.kind === 'i' && q.key === this.isoJob.key);
      if (!active || this.isoJob.version !== g.city.version) this.cancelIsoJob();
      else active.d = Math.min(active.d, -0.6);
    }
    queue.sort(function (a, b) { return a.d - b.d; });
    const budget = Math.max(1, Math.min(CFG.perf.chunkBudgetMs, this.detail.tier ? 3 : 6, 11 - (performance.now() - tStart)));
    const queueStart = performance.now();
    let n = 0;
    for (const q of queue) {
      if (n > 0 && performance.now() - queueStart >= (this.game.preview ? Math.min(3, budget) : budget)) break;
      const t1 = performance.now();
      if (q.kind === 'g') {
        const cv = this.renderGroundChunk(q.lvl, q.ci, q.cj);
        const old = this.ground.get(q.key); if (old) this.cachePx -= old.px;
        this.ground.set(q.key, { cv: cv, lvl: q.lvl, key: q.key, used: this.frame, px: cv.width * cv.height, stale: false });
        this.cachePx += cv.width * cv.height;
      } else if (q.kind === 'o') {
        this.stepOverview();
      } else {
        if (this.isoJob && this.isoJob.key !== q.key) continue;
        if (!this.isoJob) this.isoJob = { key: q.key, version: g.city.version, gen: this.isoChunkGen(q.lvl, q.ci, q.cj, q.C), cv: null };
        const deadline = performance.now() + Math.max(0.25, Math.min(2, budget - (performance.now() - queueStart)));
        do {
          const step = this.isoJob.gen.next();
          if (step.done) {
            const r = step.value, old = this.iso.get(q.key); if (old) this.cachePx -= old.px;
            r.used = this.frame; r.born = old ? this.time - 1 : this.time; r.stale = false;
            this.iso.set(q.key, r); this.cachePx += r.px; this.isoJob = null; break;
          }
          this.isoJob.cv = step.value.cv;
        } while (performance.now() < deadline);
      }
      n++;
      if (performance.now() - t1 > budget) break;
    }
    this.stats.chunksDrawn = n;
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
  Renderer.prototype.drawMetro = function (ctx, ui) {
    const g = this.game;
    const draft = g.draft ? g.draftCompiled() : null;
    const C = draft || g.compiled;
    const under = U.smooth(this.cam.under), t = this.tEase;
    const lw = this.lineWidthPx();
    const v = this.view;
    const sel = ui ? ui.selection : null;
    const hlLine = ui && ui.highlightLine;
    const lyrDim = this.layer === 'cong' || this.layer === 'flow' ? 1 - 0.65 * (this.layerFade || 0) : 1;   // 拥堵、出行方向图层下淡化地铁
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    if (!this.segPx) this.segPx = new Map(); else this.segPx.clear();
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
      this.metroOrder = { C: C, order: order, grid: CM.Geo.buckets(order, 8, g.city.W, g.city.H) };
    }
    const indexed = this.metroOrder, visible = new Set(CM.Geo.query(indexed.grid, v.x0 - 6, v.y0 - 6, v.x1 + 6, v.y1 + 6));
    // 越江隧道：所有可见区段合成一条路径、每帧只描一次（大型线网不随区段数增加描边次数）；
    // 被高亮线路淡化的区段仍在各自绘制时单独描边
    this._tunBatch = false;
    if (this.z >= 12 && under < 0.5) {
      const wp = new Path2D(), add = function (p, arr, r) { p.moveTo(arr[r[0] * 2], arr[r[0] * 2 + 1]); for (let i = r[0] + 1; i <= r[1]; i++) p.lineTo(arr[i * 2], arr[i * 2 + 1]); };
      let anyW = false;
      for (let q = 0; q < indexed.order.length; q++) {
        if (!visible.has(q)) continue;
        const cs = indexed.order[q].cs, s = cs.seg, bb = indexed.order[q].bbox;
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
    for (let q = 0; q < indexed.order.length; q++) {
      if (!visible.has(q)) continue;
      const cs = indexed.order[q].cs;
      const s = cs.seg;
      const line = C.net.lines[s.line];
      if (!line) continue;
      // 粗略裁剪
      const A = C.net.stations[s.a], B = C.net.stations[s.b];
      const bb = indexed.order[q].bbox;
      if (bb[2] < v.x0 - 6 || bb[0] > v.x1 + 6 || bb[3] < v.y0 - 6 || bb[1] > v.y1 + 6) continue;
      const arr = this.segScreen(cs, under);
      this.segPx.set(s.id, arr);
      const col = line.color;
      let alpha = 1, width = lw;
      if (s.type === 'underground') { alpha = U.lerp(0.92, 1, under); width = lw * U.lerp(0.95, 1.05, under); }
      else if (under > 0) alpha = U.lerp(1, 0.35, under);
      if (hlLine && hlLine !== s.line) alpha *= 0.3;
      alpha *= lyrDim;
      this.drawTrack(ctx, cs, arr, col, alpha, width, under, t, this._tunBatch && !(hlLine && hlLine !== s.line));
      // 草案标记
      if (draft) {
        const o = g.net.segments[s.id];
        const changed = !o || o.type !== s.type || JSON.stringify(o.pts) !== JSON.stringify(s.pts) || g.net.stations[s.a].x !== A.x || g.net.stations[s.a].y !== A.y || !g.net.stations[s.b] || g.net.stations[s.b].x !== B.x || g.net.stations[s.b].y !== B.y;
        if (changed) {
          ctx.globalAlpha = 0.9;
          ctx.strokeStyle = 'rgba(255,255,255,0.95)'; ctx.lineWidth = Math.max(1.2, width * 0.3); ctx.setLineDash([5, 5]);
          ctx.lineDashOffset = -this.time * 12;
          this.strokeArr(ctx, arr); ctx.setLineDash([]); ctx.lineDashOffset = 0;
        }
      }
      if (sel && sel.kind === 'seg' && sel.id === s.id) {
        ctx.globalAlpha = 0.35; ctx.strokeStyle = col; ctx.lineWidth = width + 8; this.strokeArr(ctx, arr);
      }
      ctx.globalAlpha = 1;
    }
    // 站外换乘：两座不同线路的运营车站之间可步行换乘（虚线连接，两站都按换乘站标示）
    const xfer = new Set(), xLinks = [];
    const mnet = g.model && g.model.net;
    if (mnet && mnet.acc) {
      const MC = mnet.C;
      for (const tr of mnet.acc.transfers) {
        if (tr.a > tr.b) continue;
        const ia = C.sIndex.get(MC.stations[tr.a].id), ib = C.sIndex.get(MC.stations[tr.b].id);
        if (ia === undefined || ib === undefined) continue;
        const la = C.stationLines[ia], lb = C.stationLines[ib];
        if (!la.size || !lb.size) continue;
        let share = false; la.forEach(function (l) { if (lb.has(l)) share = true; });
        if (share) continue;
        xfer.add(ia); xfer.add(ib); xLinks.push([ia, ib]);
      }
    }
    const stH = function (s) { let hh = CFG.metro.height[s.type]; if (hh < 0) hh = hh * under * UNDER_DEPTH; return hh; };
    if (xLinks.length) {
      ctx.strokeStyle = TH.stInter; ctx.globalAlpha = 0.55; ctx.lineWidth = Math.max(2, lw * 0.45); ctx.setLineDash([3, 4]); ctx.lineCap = 'round';
      ctx.beginPath();
      for (const l of xLinks) { const A = C.stations[l[0]], B = C.stations[l[1]], pa = this.P(A.x, A.y, stH(A)), pb = this.P(B.x, B.y, stH(B)); ctx.moveTo(pa.x, pa.y); ctx.lineTo(pb.x, pb.y); }
      ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1;
    }
    // 车站
    this.stPx = [];
    const R0 = U.clamp(this.z * 0.11, 3.2, 9);
    const mult = { S: 0.8, M: 1, L: 1.3 };
    for (let i = 0; i < C.stations.length; i++) {
      const s = C.stations[i];
      if (s.x < v.x0 - 1 || s.x > v.x1 + 1 || s.y < v.y0 - 1 || s.y > v.y1 + 1) { this.stPx.push(null); continue; }
      const h = stH(s);
      const p = this.P(s.x, s.y, h);
      const lines = C.stationLines[i];
      const inter = lines.size > 1 || xfer.has(i);
      const r = R0 * mult[s.size] * (inter ? 1.4 : 1);
      this.stPx.push({ x: p.x, y: p.y, r: r, id: s.id });
      const serviced = C.serviced[i];
      let alpha = 1;
      if (hlLine && !lines.has(hlLine)) alpha = 0.35;
      alpha *= lyrDim;
      ctx.globalAlpha = alpha;
      if (s.type === 'underground' && under > 0.05) {
        const gp = this.P(s.x, s.y, 0);
        ctx.strokeStyle = 'rgba(90,100,120,0.6)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(gp.x, gp.y); ctx.lineTo(p.x, p.y); ctx.stroke();
      }
      if (s.type === 'elevated' && this.tEase > 0.05) {
        const gp = this.P(s.x, s.y, 0);
        ctx.strokeStyle = 'rgba(120,124,130,0.7)'; ctx.lineWidth = Math.max(2, r * 0.6); ctx.beginPath(); ctx.moveTo(gp.x, gp.y); ctx.lineTo(p.x, p.y); ctx.stroke();
      }
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.fillStyle = TH.stFill; ctx.fill();
      if (!serviced) { ctx.setLineDash([3, 2]); ctx.strokeStyle = '#8a8f98'; }
      else if (inter) ctx.strokeStyle = TH.stInter;
      else { const lid = lines.values().next().value; ctx.strokeStyle = C.net.lines[lid] ? C.net.lines[lid].color : '#444'; }
      const ow = inter ? Math.max(2.2, r * 0.3) : Math.max(1.8, r * 0.36);
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
            ctx.strokeStyle = L.color; ctx.beginPath(); ctx.arc(p.x, p.y, rr, a0, a1); ctx.stroke();
          }
          ctx.lineCap = 'round';
        }
        if (r >= 6.5) xferGlyph(ctx, p.x, p.y, r * 0.36, TH.stInter);
      }
      if (draft && !g.net.stations[s.id]) {
        ctx.strokeStyle = 'rgba(30,136,229,0.9)'; ctx.lineWidth = 1.5; ctx.setLineDash([3, 3]); ctx.lineDashOffset = -this.time * 10;
        ctx.beginPath(); ctx.arc(p.x, p.y, r + 4, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]); ctx.lineDashOffset = 0;
      }
      if (sel && sel.kind === 'station' && sel.id === s.id) {
        const pulse = 0.5 + 0.5 * Math.sin(this.time * 4);
        ctx.strokeStyle = 'rgba(30,136,229,' + (0.5 + 0.4 * pulse) + ')'; ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.arc(p.x, p.y, r + 5 + pulse * 2, 0, Math.PI * 2); ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
    this.drawnC = C;
  };
  // ---------------- 轨道建设方式（v2.0） ----------------
  // 每个编译后的区段只计算一次装饰数据（采样下标）：越水区间、地下 / 地面 / 高出地面各段、桥墩与铁路交叉。
  // 远景（缩放 < 12）与地下视图沿用原有画法；中近景按轨面高度分段绘制，每帧只做描边，不重算几何。
  const DECO_BURIED = -0.035, DECO_FLAT = 0.004;   // 轨面低于约 1/3 埋深视为地下段
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
  function arrAngle(arr, i) {
    const n = arr.length / 2, a = Math.max(0, i - 1), b = Math.min(n - 1, i + 1);
    return Math.atan2(arr[b * 2 + 1] - arr[a * 2 + 1], arr[b * 2] - arr[a * 2]);
  }
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
      const p = this.P(rc.x, rc.y, 0), q = {};
      if (p.x < -30 || p.y < -30 || p.x > this.w + 30 || p.y > this.h + 30) continue;
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
  const CONG_CUT = [0.3, 0.55, 0.8];
  Renderer.CONG_COLS = CONG_COLS;
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
    const key = model.version + ':' + Math.floor(g.clock.minute / 5) + ':' + city.roadVersion;
    if (this._cgRuns && this._cgRunsKey === key) return this._cgRuns;
    const W = model.weights(g.clock.minute), sat = new Map();
    const satOf = function (id) {
      let v = sat.get(id);
      if (v === undefined) { v = Math.max(model.arcVolAt(2 * id, W), model.arcVolAt(2 * id + 1, W)) / model.cap(2 * id); sat.set(id, v); }
      return v;
    };
    const lvl = function (x) { let k = 0; while (k < 3 && x >= CONG_CUT[k]) k++; return k; };
    const paths = [], halo = { 3: new Path2D(), 4: new Path2D() };
    for (let k = 0; k < 4; k++) paths.push({ 3: new Path2D(), 4: new Path2D() });
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
      let first = 0; for (let i = 0; i < n; i++) if (w.lk[i] >= 0) { first = lvl(satOf(w.lk[i])); break; }   // 没有对应路段的道路按畅通显示
      let cur = first, start = 0;
      for (let i = 1; i < n; i++) {
        const k = w.lk[i] >= 0 ? lvl(satOf(w.lk[i])) : cur;
        if (k !== cur) { push(w, start, i, cur); start = i; cur = k; }
      }
      push(w, start, n - 1, cur);
    }
    this._cgRuns = { paths: paths, halo: halo, n: nRuns }; this._cgRunsKey = key;
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
    for (let k = 0; k < 4; k++) {
      ctx.strokeStyle = CONG_COLS[k];
      for (const cls of [3, 4]) { ctx.lineWidth = lw * widthOf[cls] * (k >= 2 ? 1.15 : 1); ctx.stroke(cr.paths[k][cls]); }
    }
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
    ctx.font = '600 12px ' + FONT;
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
    ctx.font = '600 11px ' + FONT;
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
    ctx.font = '600 11px ' + FONT; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const L of labels) {
      const b = flowLabelBox(L.G, ctx.measureText(L.t).width);
      ctx.globalAlpha = L.a; ctx.lineWidth = 3; ctx.strokeStyle = TH.halo; ctx.strokeText(L.t, b.cx, b.cy);
      ctx.fillStyle = TH.night ? '#b9c4cf' : '#465264'; ctx.fillText(L.t, b.cx, b.cy);
    }
    // 片区圆点与名称
    ctx.font = '700 12px ' + FONT;
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
      const rt = C.routes[r], re = net.rideEdge[r];
      for (let k = 0; k < rt.segRefs.length; k++) {
        let d = 0, lf = 0;
        for (const x of dts) for (let p = 0; p < 4; p++) {
          const P = model.ctxs[x[0]].per[p];
          if (!P.load || P.load.length !== net.nE) continue;
          d += ((P.load[re[2 * k]] || 0) + (P.load[re[2 * k + 1]] || 0)) * model.pHours[p] * (p === 3 ? 0.9 : 1) * x[1];
          const capH = Math.max(1, (P.freq[r] || 0) * rt.cap);
          lf = Math.max(lf, (P.load[re[2 * k]] || 0) / capH, (P.load[re[2 * k + 1]] || 0) / capH);
        }
        const id = rt.segRefs[k].id; segLoad.set(id, Math.max(segLoad.get(id) || 0, d)); segLF.set(id, Math.max(segLF.get(id) || 0, lf));
      }
    }
    let vmax = 1; for (let i = 0; i < N; i++) vmax = Math.max(vmax, val[i]);
    let smax = 1; segLoad.forEach(function (v) { smax = Math.max(smax, v); });
    this._sf = { val: val, ratio: ratio, segLoad: segLoad, segLF: segLF, vmax: vmax, smax: smax }; this._sfKey = key;
    return this._sf;
  };
  Renderer.prototype.drawStationFlows = function (ctx) {
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
        ctx.strokeStyle = U.rgb(col, 0.55); ctx.lineWidth = this.lineWidthPx() + (4 + 10 * Math.min(1.5, lf)) * zk;
      } else { ctx.strokeStyle = U.rgb(U.hex2rgb(L.color), 0.32); ctx.lineWidth = this.lineWidthPx() + (3 + 22 * Math.sqrt(v / sf.smax)) * zk; }
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
      ctx.fillStyle = U.rgb(col, 0.78); ctx.strokeStyle = TH.halo; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(it.sp.x, it.sp.y, it.r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    }
    // 标注：站名 + 日客流，放在圆的下方；大站优先，互不重叠（本图层不显示普通站名）
    const placed = list.map(function (it) { return [it.sp.x - it.r * 0.7, it.sp.y - it.r * 0.7, it.sp.x + it.r * 0.7, it.sp.y + it.r * 0.7]; });
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    let shown = 0;
    for (let q = list.length - 1; q >= 0 && shown < 30; q--) {
      const it = list[q], name = C.stations[it.i].name, val = loadView ? '高峰负荷 ' + U.fmtPct(sf.ratio[it.i], 0) : U.fmtPeople(it.v) + ' 人次';
      ctx.font = '600 12px ' + FONT; const w1 = ctx.measureText(name).width;
      ctx.font = '11px ' + FONT; const w2 = ctx.measureText(val).width;
      const w = Math.max(w1, w2) + 6, x = it.sp.x, y = it.sp.y + it.r + 4;
      const b = [x - w / 2, y, x + w / 2, y + 28];
      if (placed.some(function (o, k) { return k !== q && b[0] < o[2] && b[2] > o[0] && b[1] < o[3] && b[3] > o[1]; })) continue;
      placed.push(b); shown++;
      ctx.lineJoin = 'round'; ctx.lineWidth = 3.2; ctx.strokeStyle = TH.halo;
      ctx.font = '600 12px ' + FONT; ctx.strokeText(name, x, y + 7); ctx.fillStyle = TH.ink; ctx.fillText(name, x, y + 7);
      ctx.font = '11px ' + FONT; ctx.strokeText(val, x, y + 21); ctx.fillStyle = TH.roadInk; ctx.fillText(val, x, y + 21);
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
      const m = f.T.hub ? fd.innM[k] + fd.outM[k] : fd.innM[k];
      if (this.layer === 'fac' && facP !== 'all') { const qi = PK.indexOf(facP); v = qi >= 0 ? fd.purp[k * 6 + qi] * (f.T.hub && facP === 'hb' ? 2 : 1) : 0; if (!(v > 0)) return; }
      const cov = acc && acc.NZ === fn.NZ ? acc.zCov[model.Z + k] : 0;
      out.push({ f: f, k: k, v: v, share: v > 0 ? m / Math.max(v, 1) : 0, cov: cov });
      if (v > vmax) vmax = v;
    }, this);
    return { list: out, vmax: vmax };
  };
  Renderer.prototype.drawFacilities = function (ctx) {
    this._facPx = [];
    const fm = this.facMarkers(); if (!fm) return;
    const gap = this.layer === 'gap', zk = U.clamp(this.z / 26, 0.5, 1.15), tmp = {};
    const list = fm.list.slice().sort(function (a, b) { return a.v - b.v; });
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const it of list) {
      if (gap && (it.cov >= 0.3 || it.v < 1500)) continue;
      const p = this.P(it.f.x, it.f.y, 0, tmp);
      if (p.x < -40 || p.y < -40 || p.x > this.w + 40 || p.y > this.h + 40) continue;
      const r = (4 + 16 * Math.sqrt(it.v / fm.vmax)) * zk;
      const ring = gap ? [122, 31, 31] : U.ramp([[0, [214, 52, 52]], [0.25, [236, 160, 50]], [0.6, [40, 160, 90]]], U.clamp(it.share, 0, 0.6) / 0.6);
      ctx.fillStyle = gap ? 'rgba(122,31,31,0.18)' : U.rgb(U.hex2rgb(CFG.trips.color[Object.keys(it.f.p)[0]] || '#888888'), 0.55);
      ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2); ctx.fill();
      ctx.lineWidth = 3; ctx.strokeStyle = U.rgb(ring, 0.95); ctx.stroke();
      ctx.lineWidth = 1.2; ctx.strokeStyle = TH.halo; ctx.beginPath(); ctx.arc(p.x, p.y, r + 2, 0, Math.PI * 2); ctx.stroke();
      this._facPx.push({ id: it.f.id, x: p.x, y: p.y, r: Math.max(8, r + 2) });
    }
    // 标注：到访量较大的设施（不互相重叠）
    const placed = [];
    let shown = 0;
    for (let q = list.length - 1; q >= 0 && shown < 24; q--) {
      const it = list[q];
      if (gap && (it.cov >= 0.3 || it.v < 1500)) continue;
      const p = this.P(it.f.x, it.f.y, 0, tmp), r = (4 + 16 * Math.sqrt(it.v / fm.vmax)) * zk;
      const name = it.f.name.replace(/（.*）/, ''), val = gap ? '无地铁接驳 · ' + U.fmtPeople(it.v) + ' 人次' : U.fmtPeople(it.v) + ' 人次 · 地铁 ' + U.fmtPct(it.share, 0);
      ctx.font = '600 12px ' + FONT; const w = Math.max(ctx.measureText(name).width, ctx.measureText(val).width * 0.92) + 8;
      const b = [p.x - w / 2, p.y + r + 2, p.x + w / 2, p.y + r + 30];
      if (b[2] < 0 || b[0] > this.w || b[3] < 0 || b[1] > this.h) continue;
      if (placed.some(function (o) { return b[0] < o[2] && b[2] > o[0] && b[1] < o[3] && b[3] > o[1]; })) continue;
      placed.push(b); shown++;
      ctx.lineJoin = 'round'; ctx.lineWidth = 3.2; ctx.strokeStyle = TH.halo;
      ctx.strokeText(name, p.x, p.y + r + 9); ctx.fillStyle = TH.ink; ctx.fillText(name, p.x, p.y + r + 9);
      ctx.font = '11px ' + FONT; ctx.strokeText(val, p.x, p.y + r + 23); ctx.fillStyle = TH.roadInk; ctx.fillText(val, p.x, p.y + r + 23);
    }
  };
  // 点击选中设施：设施图层中的圆点；其他情况下点在设施场地（地标）或其中心附近
  Renderer.prototype.pickFacility = function (sx, sy, wx, wy) {
    const g = this.game, model = g && g.model;
    if (!model || !model.fn) return null;
    if ((this.layer === 'fac' || this.layer === 'gap') && this._facPx) {
      let best = null, bd = 1e9;
      for (const it of this._facPx) { const d = Math.hypot(sx - it.x, sy - it.y); if (d <= it.r && d < bd) { bd = d; best = it.id; } }
      if (best) return best;
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
        for (let p = 0; p < 4; p++) { const P = model.ctxs[dt].per[p]; if (!P.load || P.load.length !== net.nE) continue; const cap = Math.max(1, P.freq[r] * rt.cap); lf = Math.max(lf, P.load[re[2 * k]] / cap, P.load[re[2 * k + 1]] / cap); }
        if (lf <= 1) continue;
        const arr = this.segPx && this.segPx.get(rt.segRefs[k].id); if (!arr) continue;
        ctx.strokeStyle = 'rgba(239,138,58,0.75)'; ctx.lineWidth = this.lineWidthPx() + 8 * zk; this.strokeArr(ctx, arr);
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
  Renderer.prototype.drawLabels = function (ctx, ui) {
    if (this.game.preview) return;
    const step = (this.dt || 0.016) / 0.25;
    const labA = U.clamp((this.labA == null ? (this.labelsOn ? 1 : 0) : this.labA) + (this.labelsOn ? step : -step), 0, 1);
    const mapLabA = U.clamp((this.mapLabA == null ? (this.mapLabelsOn !== false ? 1 : 0) : this.mapLabA) + (this.mapLabelsOn !== false ? step : -step), 0, 1);
    const key = [this.w, this.h, this.dpr, this.z, this.ox, this.oy, this.hs, this.M.join(','), this.cam.under, this.tEase > 0.5, this.bFade > 0.5, this.game.city.version, this.game.netVersion, this.layer, labA, mapLabA, this.themeName, document.fonts ? document.fonts.status : ''].join('|');
    let image = this.labelImage;
    if (!image || image.key !== key || image.C !== this.drawnC) {
      const cv = image && image.cv.width === this.cv.width && image.cv.height === this.cv.height ? image.cv : makeCanvas(this.cv.width, this.cv.height);
      const x = cv.getContext('2d');
      x.setTransform(1, 0, 0, 1, 0, 0); x.clearRect(0, 0, cv.width, cv.height); x.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      this.drawLabelContent(x, ui);
      image = this.labelImage = { key: key, C: this.drawnC, cv: cv };
    } else { this.labA = labA; this.mapLabA = mapLabA; }
    ctx.drawImage(image.cv, 0, 0, this.w, this.h);
  };
  Renderer.prototype.drawLabelContent = function (ctx, ui) {
    const g = this.game, z = this.z, v = this.view, city = g.city;
    if (g.preview) return;   // 开始界面背景不显示标注
    // 标注开关渐隐渐现（不闪切）
    const step = (this.dt || 0.016) / 0.25;
    this.labA = U.clamp((this.labA == null ? (this.labelsOn ? 1 : 0) : this.labA) + (this.labelsOn ? step : -step), 0, 1);
    this.mapLabA = U.clamp((this.mapLabA == null ? (this.mapLabelsOn !== false ? 1 : 0) : this.mapLabA) + (this.mapLabelsOn !== false ? step : -step), 0, 1);
    const placed = new Map(), tile = 48;
    const fits = function (x0, y0, x1, y1) {
      const i0 = Math.floor(x0 / tile), i1 = Math.floor(x1 / tile), j0 = Math.floor(y0 / tile), j1 = Math.floor(y1 / tile);
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        const list = placed.get(i + ':' + j);
        if (list) for (const r of list) if (x0 < r[2] && x1 > r[0] && y0 < r[3] && y1 > r[1]) return false;
      }
      const rect = [x0, y0, x1, y1];
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) { const key = i + ':' + j; let list = placed.get(key); if (!list) { list = []; placed.set(key, list); } list.push(rect); }
      return true;
    };
    const halo = function (text, x, y, font, fill, align) {
      ctx.font = font; ctx.textAlign = align || 'left'; ctx.textBaseline = 'middle';
      ctx.lineWidth = 3.2; ctx.strokeStyle = TH.halo; ctx.lineJoin = 'round';
      ctx.strokeText(text, x, y); ctx.fillStyle = fill; ctx.fillText(text, x, y);
    };
    // 车站名
    const C = this.drawnC;
    const busyLayer = this.layer === 'cong' || this.layer === 'flow' || this.layer === 'station' || this.layer === 'fac' || this.layer === 'gap';   // 这两个图层自带标注，隐藏站名、区名与未开放区域
    if (C && this.stPx && z >= 8.5 && this.labA > 0.01 && !busyLayer) {
      ctx.globalAlpha = this.labA;
      const fs = z >= 22 ? 12.5 : 11.5;
      ctx.font = fs + 'px ' + FONT;
      const order = this.stPx.map(function (p, i) { return [p, i]; }).filter(function (a) { return a[0]; });
      order.sort(function (a, b) { return (C.stationLines[b[1]].size - C.stationLines[a[1]].size) || ({ L: 2, M: 1, S: 0 }[C.stations[b[1]].size] - { L: 2, M: 1, S: 0 }[C.stations[a[1]].size]); });
      for (const it of order) {
        const p = it[0], s = C.stations[it[1]];
        const w = this.textWidth(ctx, s.name);
        const x = p.x + p.r + 4, y = p.y;
        if (!fits(x - 2, y - fs / 2 - 2, x + w + 2, y + fs / 2 + 2)) continue;
        halo(s.name, x, y, (C.stationLines[it[1]].size > 1 ? '600 ' : '') + fs + 'px ' + FONT, TH.ink);
      }
      ctx.globalAlpha = 1;
    }
    ctx.globalAlpha = this.mapLabA;
    // 地标
    if (z >= 13 && this.mapLabA > 0.01 && this.layer === 'none') {
      for (let k = 0; k < D.landmarks.length; k++) {
        if (!city.landmarkOn[k]) continue;
        const lm = D.landmarks[k];
        if (lm.x < v.x0 || lm.x > v.x1 || lm.y < v.y0 || lm.y > v.y1) continue;
        const h = this.tEase > 0.5 && this.bFade > 0.5 ? (lm.h ? lm.h * EX : 34 * EX * 1.6) : 0;
        const p = this.P(lm.x, lm.y, h);
        ctx.font = '11px ' + FONT;
        const text = '◆ ' + lm.name;
        const w = this.textWidth(ctx, text);
        if (!fits(p.x - w / 2, p.y - 18, p.x + w / 2, p.y - 6)) continue;
        halo(text, p.x, p.y - 12, '11px ' + FONT, TH.landmarkInk, 'center');
      }
    }
    // 道路名
    if (z >= 22 && this.layer === 'none' && this.mapLabA > 0.01) {
      ctx.font = '10.5px ' + FONT;
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
        const pt = this.P(geom.x, geom.y, 0);
        if (pt.x < 0 || pt.y < 0 || pt.x > this.w || pt.y > this.h) continue;
        const text = gr.name;
        const tw = this.textWidth(ctx, text);
        if (!fits(pt.x - tw / 2, pt.y - 7, pt.x + tw / 2, pt.y + 7)) continue;
        seen.add(gr.name);
        halo(text, pt.x, pt.y, '10.5px ' + FONT, TH.roadInk, 'center');
      }
    }    // 区名
    if (z < 16 && this.mapLabA > 0.01 && this.layer !== 'flow') {
      const a = U.clamp((16 - z) / 5, 0, 1) * 0.75;
      for (const dl of (city.districtLabels || [])) {
        const p = this.P(dl[1], dl[2], 0);
        ctx.globalAlpha = a * this.mapLabA;
        halo(dl[0], p.x, p.y, '600 ' + (z < 9 ? 15 : 17) + 'px ' + FONT, TH.district, 'center');
      }
      ctx.globalAlpha = 1;
    }
    ctx.globalAlpha = 1;
    // 未开放区域标签
    if (z < 24 && !busyLayer) {
      const shown = new Set();
      for (let k = 0; k < city.regions.length; k++) {
        const rg = city.regions[k];
        if (city.regionOpen[k] || rg.scenic || rg.cx == null || !rg.cells || shown.has(k)) continue;
        const cx = rg.cx, cy = rg.cy;
        if (cx < v.x0 || cx > v.x1 || cy < v.y0 || cy > v.y1) continue;
        const p = this.P(cx, cy, 0);
        const text = '🔒 ' + rg.name.replace(/（.*）/, '') + ' · ' + U.regionLock(rg);
        ctx.font = '11px ' + FONT;
        const w = this.textWidth(ctx, text);
        if (!fits(p.x - w / 2, p.y - 8, p.x + w / 2, p.y + 8)) continue;
        halo(text, p.x, p.y, '11px ' + FONT, TH.lockInk, 'center');
        shown.add(k);
      }
    }
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
  Renderer.prototype.fitAll = function () {
    const zx = this.w / (CFG.W + 4), zy = this.h / (CFG.H + 4);
    this.cam.tz = this.cam.zoom = U.clamp(Math.min(zx, zy) * 1.05, 5, 96);
    this.cam.cx = CFG.W / 2; this.cam.cy = CFG.H / 2;
  };
  CM.RENDER_CONST = { EX: EX, HSF: HSF, ISO: ISO, UNDER_DEPTH: UNDER_DEPTH };
})(window.CM);
