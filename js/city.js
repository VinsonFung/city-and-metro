'use strict';
// 城市：地形、区域、土地利用、人口与就业、道路网络（格网顶点 + 边）及城市发展
(function (CM) {
  const U = CM.U, CFG = CM.CFG, D = CM.DATA;
  const LU = { RURAL: 0, RES: 1, COM: 2, IND: 3, MIX: 4, PARK: 5, INST: 6, WATER: 7, HILL: 8, AIRPORT: 9, LANDMARK: 10 };
  CM.LU = LU;
  CM.LU_NAME = ['农村/待开发', '住宅', '商业办公', '工业仓储', '混合功能', '公园绿地', '学校与机构', '水域', '山地风景区', '机场', '历史地标'];
  const PLAN_KEYS = { RES: LU.RES, COM: LU.COM, IND: LU.IND, MIX: LU.MIX, INST: LU.INST };
  const CELL_KM2 = 0.0625;

  let CITY_SEQ = 0;
  function City() {
    this.uid = ++CITY_SEQ;   // 城市实例编号：几何等缓存按实例区分（不同地图、不同进度不会互相复用）
    this.mapId = CM.mapId;   // 所属地图：切换地图后旧城市的迟到调用不能混用新地图的数据（见 Fac.list）
    this.terrainVer = 0;     // 地形阶段（填海后递增）
    this.W = CFG.W; this.H = CFG.H; this.N = this.W * this.H;
    this.VW = this.W + 1; this.VH = this.H + 1; this.V = this.VW * this.VH;
    this.version = 0; this.roadVersion = 0;
    this.lockVer = 0;        // 区域开放状态（可建设范围缓存，见 lockState）
    this.geoVer = 0;         // 线路几何依赖的城市数据（水面、铁路、地标、机场）：月度增长不变，线路几何不必每月重算
    this.dirty = new Set();
  }
  CM.City = City;

  City.prototype.idx = function (i, j) { return j * this.W + i; };
  City.prototype.cellAt = function (x, y) {
    const i = Math.floor(x), j = Math.floor(y);
    if (i < 0 || j < 0 || i >= this.W || j >= this.H) return -1;
    return j * this.W + i;
  };
  City.prototype.zoneOf = function (c) {
    const Z = CFG.ZONE;
    const i = c % this.W, j = (c / this.W) | 0;
    return ((j / Z) | 0) * (this.W / Z) + ((i / Z) | 0);
  };

  // ---------------- 生成 ----------------
  const FS = 4;   // 水域、绿地栅格：每格 4×4 子像素（约 62 m）
  const BS = 8;   // 建筑避让栅格：每格 8×8 子像素（约 31 m）
  // opts.densityScale：人口中心密度（按开局年标定）放大的倍数，只影响「是否已城市化」的判断（地图扩展迁移按存档年份生成新增范围时使用）
  // 生成与恢复城市分步执行（v2.6）：载入界面的动画和进度不再被几秒钟的同步计算卡住；结果与一次算完相同
  City.prototype.generate = function (seed, startYear, opts) { const it = this.generateGen(seed, startYear, opts); let r = it.next(); while (!r.done) r = it.next(); };
  City.prototype.generateGen = function* (seed, startYear, opts) {
    const W = this.W, H = this.H, N = this.N, ds = (opts && opts.densityScale) || 1;
    this.seed = seed;
    this.regions = D.regions.concat([D.defaultRegion]);
    for (const r of this.regions) if (r.plan0) r.plan = r.plan0;   // 上一局改变过的片区规划（applyReplan）恢复原样
    this.regionOpen = new Uint8Array(this.regions.length);
    this.regionOpenDate = this.regions.map(function () { return null; });
    for (let k = 0; k < this.regions.length; k++) {
      const rg = this.regions[k];
      if (rg.open != null && rg.open <= startYear) { this.regionOpen[k] = 1; this.regionOpenDate[k] = [startYear, 1]; }
    }
    this.lu = new Uint8Array(N);
    this.plan = new Uint8Array(N);
    this.pop = new Float32Array(N);
    this.jobs = new Float32Array(N);
    this.bh = new Float32Array(N);
    this.street = new Uint8Array(N);
    this.protectedId = new Int16Array(N);
    this.taken = new Float32Array(N);
    this.urbanYear = new Uint16Array(N);
    this.isPark = new Uint8Array(N);
    this.landmarkOn = new Uint8Array(D.landmarks.length);
    this.terrainYear = startYear;   // 历史海岸线：此年份之后才形成的填海土地仍按水域处理
    this.buildTerrain();
    yield;

    // 规划用地
    const airportK = this.regions.findIndex(function (r) { return r.id === 'airport'; });
    for (let c = 0; c < N; c++) {
      if (this.waterD[c] < 0 && this.landFrac[c] < 0.5) { this.plan[c] = LU.WATER; this.lu[c] = LU.WATER; continue; }
      if (this.regions[this.region[c]].scenic) { this.plan[c] = LU.HILL; this.lu[c] = LU.HILL; continue; }
      this.plan[c] = this.planFor(c);
      this.lu[c] = LU.RURAL;
      // 公园，或整体保留为绿地的区域（如湿地公园）
      if (D.airport && D.airport.runwayExt && this.region[c] === airportK && startYear < D.airport.closeYear) this.lu[c] = LU.AIRPORT;
      else if (this.parkCov[c] >= 0.45 || this.regions[this.region[c]].park) { this.plan[c] = LU.PARK; this.lu[c] = LU.PARK; this.isPark[c] = 1; }
      else if (D.airport && this.region[c] === airportK && startYear < D.airport.closeYear) this.lu[c] = LU.AIRPORT;
    }
    this.activateLandmarks(startYear);
    yield;

    // 1990 年人口与就业（估算）
    let sumP = 0, sumJ = 0;
    for (let c = 0; c < N; c++) {
      if ((c & 4095) === 4095) yield;
      const L = this.lu[c];
      if (L === LU.WATER || L === LU.HILL || L === LU.PARK || L === LU.AIRPORT) continue;
      const i = c % W, j = (c / W) | 0, cx = i + 0.5, cy = j + 0.5;
      let p = D.rural.pop, jb = D.rural.jobs;
      for (const ct of D.centers) {
        const d = U.dist(cx, cy, ct.x, ct.y) / (ct.r * 4);
        const w = Math.exp(-d * d);
        p += ct.pop * w; jb += ct.jobs * w;
      }
      p *= 0.7 + 0.6 * U.fbm(cx * 0.3, cy * 0.3, seed + 3);
      jb *= 0.65 + 0.7 * U.hash2(i, j, seed + 5);
      // 林地与未开放区域人口较少
      p *= 1 - 0.6 * this.wood[c]; jb *= 1 - 0.6 * this.wood[c];
      const urban = (p + jb) * ds > 2600;
      if (urban && L !== LU.LANDMARK) {
        this.lu[c] = this.plan[c];
        const f = luSplit(this.lu[c]);
        p *= f[0]; jb *= f[1];
        this.street[c] = 1; this.urbanYear[c] = startYear;
      }
      if (L === LU.LANDMARK) { const lm = D.landmarks[this.protectedId[c] - 1]; if (lm && lm.kind === 'campus') { p *= 0.5; } else { p = 0; jb *= 0.3; } this.street[c] = 1; }
      const lf = this.landFrac[c];
      this.pop[c] = p * CELL_KM2 * lf; this.jobs[c] = jb * CELL_KM2 * lf;
      sumP += this.pop[c]; sumJ += this.jobs[c];
    }
    const tP = U.interp(CFG.growth.popCurve, startYear), tJ = tP * U.interp(CFG.growth.jobsRatio, startYear);
    for (let c = 0; c < N; c++) { this.pop[c] *= tP / sumP; this.jobs[c] *= tJ / sumJ; }
    for (let c = 0; c < N; c++) this.bh[c] = this.heightFor(c, startYear);
    yield;

    // 道路格网顶点（规则方格；真实道路在其上近似通行，绘制使用真实线形）
    this.vx = new Float32Array(this.V); this.vy = new Float32Array(this.V);
    for (let j = 0; j <= H; j++) for (let i = 0; i <= W; i++) { const v = j * this.VW + i; this.vx[v] = i; this.vy[v] = j; }

    // 道路格网
    const nH = (H + 1) * W, nV = H * (W + 1), nD = H * W;
    this.nE = [nH, nV, nD, nD];
    this.eOff = [0, nH, nH + nV, nH + nV + nD];
    const nTot = nH + nV + 2 * nD;
    this.eArt = new Uint8Array(nTot);   // 规划道路等级
    this.eName = new Uint16Array(nTot);
    this.eCls = new Uint8Array(nTot);   // 最终等级
    this.eBlock = new Uint8Array(nTot); // 跨水
    for (let e = 0; e < nTot; e++) { this.eBlock[e] = this.edgeBlock(e); if ((e & 16383) === 16383) yield; }
    this.buildRoadGroups();
    yield;
    yield* this.applyRoadsGen(startYear);
    this.updateStreets();
    yield;
    if(!opts||!opts.deferGraphs)yield* this.buildGraphsGen();
    this.version++; this.geoVer++;
  };

  function luSplit(L) {
    switch (L) {
      case LU.RES: return [1.25, 0.35];
      case LU.COM: return [0.35, 1.6];
      case LU.IND: return [0.25, 1.35];
      case LU.INST: return [0.55, 0.9];
      default: return [1, 1];
    }
  }

  // 规划用地：按所在区域的用地配方随机选取，并用低频噪声让同类用地成片（确定性，填海后的新土地复用）
  // 历史城区（v2.6，机制见 traits.js）：区域的 heritage 标记（1，只能走地下、造价更高）与地标周围的地下保护范围（D.heritage.guards，2，更贵）。
  // 只由地图数据决定，不进存档
  City.prototype.buildHeritage = function () {
    this.heritage = null; const H = D.heritage; if (!H) return;
    const W = this.W, a = new Uint8Array(this.N), R = this.regions;
    for (let c = 0; c < this.N; c++) if (R[this.region[c]].heritage && this.landMax[c] >= 0.5) a[c] = 1;
    this.heritageGuards = [];
    for (const g of H.guards || []) {
      const lm = D.landmarks.find(function (l) { return l.id === g.lm; }); if (!lm) continue;
      this.heritageGuards.push({ x: lm.x, y: lm.y, r: g.r, name: g.name || lm.name });
      const r = Math.ceil(g.r + 1), i0 = Math.floor(lm.x), j0 = Math.floor(lm.y);
      for (let j = j0 - r; j <= j0 + r; j++) for (let i = i0 - r; i <= i0 + r; i++) { if (i < 0 || j < 0 || i >= W || j >= this.H) continue; if (U.dist(i + 0.5, j + 0.5, lm.x, lm.y) <= g.r && this.landMax[j * W + i] >= 0.5) a[j * W + i] = 2; }
    }
    this.heritage = a;
  };
  City.prototype.heritageName = function (c) {
    const g = (this.heritageGuards || []).find(function (q) { return U.dist(c % this.W + 0.5, ((c / this.W) | 0) + 0.5, q.x, q.y) <= q.r; }, this);
    return g && this.heritage[c] === 2 ? g.name : String(this.regions[this.region[c]].name).replace(/（.*）/, '');
  };
  // 片区规划随年代改变（v2.6，码头关闭后改作商务区，D.replan）：之后这里长出的是办公楼。keepLu 为读档时（用地已从存档恢复）只改规划名称
  City.prototype.applyReplan = function (year, keepLu) {
    const list = D.replan; if (!list) return [];
    const done = this._replan || (this._replan = {}), out = [];
    list.forEach(function (e, i) {
      if (done[i] || year < e.year) return;
      done[i] = 1;
      const k = this.regions.findIndex(function (r) { return r.id === e.region; }); if (k < 0) return;
      const rg = this.regions[k]; if (!rg.plan0) rg.plan0 = rg.plan;
      rg.plan = e.plan; if (e.maxHeight) rg.maxHeight = e.maxHeight;
      out.push(e);
      if (keepLu) return;
      for (let c = 0; c < this.N; c++) {
        if (this.region[c] !== k || this.plan[c] === LU.WATER || this.plan[c] === LU.PARK || this.plan[c] === LU.HILL || this.plan[c] === LU.AIRPORT) continue;
        const p = this.planFor(c); this.plan[c] = p;
        if (this.lu[c] === LU.IND) { this.lu[c] = p; this.dirty.add(c); }
      }
    }, this);
    return out;
  };
  City.prototype.planFor = function (c) {
    const W = this.W, i = c % W, j = (c / W) | 0, rg = this.regions[this.region[c]];
    const planName = rg.plan || 'res', dist = D.plans[planName] || D.plans.res;
    const r = U.hash2(i, j, this.seed + 7);
    let acc = 0, pick = LU.RES;
    for (const key in dist) { acc += dist[key]; if (r <= acc) { pick = PLAN_KEYS[key]; break; } }
    const nz = U.noise2((i + 0.5) * 0.22, (j + 0.5) * 0.22, this.seed + 11);
    if (planName !== 'cbd' && nz > 0.72 && dist.COM) pick = LU.COM;
    else if (nz < 0.18 && dist.IND) pick = LU.IND;
    return pick;
  };
  // 历史海岸线：D.reclaim 为后来形成的填海土地（多边形，格坐标）。year 大于当前地形年份的仍按水域处理
  City.prototype.reclaimFeats = function (pendingOnly) {
    const out = [], self = this;
    (D.reclaim || []).forEach(function (r, k) {
      if (pendingOnly && r.year <= self.terrainYear) return;
      if (!r._f) { const p = new Float32Array([].concat.apply([], r.poly)); r._f = { name: r.name, rings: [{ outer: true, p: p }], bbox: CM.Geo.bbox(p), k: k }; }
      out.push(r._f);
    });
    return out;
  };
  // 填海范围的实际水面（v2.1）：数据中的填海多边形是手绘的近似范围，整片画成水面会盖住本来就是陆地的山林与旧街区。
  // 只保留多边形内「现代为陆地、不是旧陆地上的林地、离现代水面不超过约 2.5 km、且与现代水面连通」的部分，再平滑边缘。
  // 结果按子像素栅格缓存（确定性，只依赖地图数据）：
  //   mask：Uint16Array(FW*FH)，填海土地像素为 60001+k（全部填海项，不论是否已成陆）
  //   parts[k]：{ k, bbox, fill: [Float32Array 多边形…]（格坐标，含相邻的现代水面，便于无缝衔接）, edge: Float32Array 岸线线段 [x0,y0,x1,y1,…] }
  City.prototype.reclaimGeom = function () {
    if (this._rcg) return this._rcg;
    const Geo = CM.Geo, FW = this.FW, FH = this.FH, S = FS, list = D.reclaim || [];
    const mask = new Uint16Array(FW * FH), parts = [];
    this._rcg = { mask: mask, parts: parts };
    if (!list.length) return this._rcg;
    const w0 = new Uint8Array(FW * FH);
    Geo.fill(w0, FW, FH, S, Geo.water);
    Geo.waterLines.forEach(function (l) { Geo.stroke(w0, FW, FH, S, l.p, Math.max(l.w / 2, 0.025), 1); });
    const wd = new Uint8Array(FW * FH);
    Geo.fill(wd, FW, FH, S, Geo.woods); Geo.fill(wd, FW, FH, S, Geo.reserves);
    const sdf = Geo.sdf(w0, FW, FH), DMAX = 10 * S, loc = new Uint8Array(FW * FH);
    const self = this, fields = [];
    list.forEach(function (r, k) {
      const f = self.reclaimFeats(false)[k];
      const bb = f.bbox, x0 = Math.max(0, Math.floor(bb[0] * S) - 16), y0 = Math.max(0, Math.floor(bb[1] * S) - 16);
      const x1 = Math.min(FW - 1, Math.ceil(bb[2] * S) + 16), y1 = Math.min(FH - 1, Math.ceil(bb[3] * S) + 16);
      const bw = x1 - x0 + 1, bh = y1 - y0 + 1;
      Geo.fill(loc.fill(0), FW, FH, S, [f]);   // 多边形栅格（全图尺寸的扫描线填充，只读局部）
      // 旧陆地上的林地：与多边形外的林地连成一片的（如香港的山体）；完全在多边形内的林地是填海土地上的公园（如东京葛西临海公园），仍按填海处理
      const old = new Uint8Array(bw * bh), ost = [];
      // 只沿陆地上的林地连通（自然保护区的范围常延伸到海面，如葛西的湿地，不能借此把海中小岛连成旧陆地）
      for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) { const i = (y + y0) * FW + x + x0; if (wd[i] && !w0[i] && !loc[i]) { old[y * bw + x] = 1; ost.push(y * bw + x); } }
      while (ost.length) {
        const q = ost.pop(), x = q % bw, y = (q / bw) | 0;
        const nb = [x > 0 ? q - 1 : -1, x < bw - 1 ? q + 1 : -1, y > 0 ? q - bw : -1, y < bh - 1 ? q + bw : -1];
        for (const n of nb) { if (n < 0 || old[n]) continue; const gi = ((n / bw) | 0) * FW + y0 * FW + (n % bw) + x0; if (wd[gi] && !w0[gi]) { old[n] = 1; ost.push(n); } }
      }
      const keep = new Uint8Array(bw * bh);
      for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) {
        const i = (y + y0) * FW + x + x0;
        if (loc[i] && !w0[i] && !old[y * bw + x] && sdf[i] <= DMAX) keep[y * bw + x] = 1;
      }
      // 与现代水面连通（从紧邻水面的保留像素出发泛洪）
      const seen = new Uint8Array(bw * bh), st = [];
      for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) {
        const q = y * bw + x; if (!keep[q]) continue;
        const gx = x + x0, gy = y + y0;
        if ((gx > 0 && w0[gy * FW + gx - 1]) || (gx < FW - 1 && w0[gy * FW + gx + 1]) || (gy > 0 && w0[(gy - 1) * FW + gx]) || (gy < FH - 1 && w0[(gy + 1) * FW + gx])) { seen[q] = 1; st.push(q); }
      }
      while (st.length) {
        const q = st.pop(), x = q % bw, y = (q / bw) | 0;
        const nb = [x > 0 ? q - 1 : -1, x < bw - 1 ? q + 1 : -1, y > 0 ? q - bw : -1, y < bh - 1 ? q + bw : -1];
        for (const n of nb) if (n >= 0 && keep[n] && !seen[n]) { seen[n] = 1; st.push(n); }
      }
      // 平滑场：保留像素为 1，紧邻保留像素（6 像素内）的现代水面也为 1（岸线只出现在旧海岸一侧）
      let v = new Float32Array(bw * bh);
      for (let q = 0; q < bw * bh; q++) if (seen[q]) v[q] = 1;
      for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) {
        const q = y * bw + x; if (v[q] || !w0[(y + y0) * FW + x + x0]) continue;
        let near = false;
        for (let dy = -6; dy <= 6 && !near; dy++) for (let dx = -6; dx <= 6; dx++) { const xx = x + dx, yy = y + dy; if (xx >= 0 && yy >= 0 && xx < bw && yy < bh && seen[yy * bw + xx]) { near = true; break; } }
        if (near) v[q] = 1;
      }
      // 手绘多边形的直边与尖角：多次平均磨圆，再叠加低频噪声，让旧海岸线有自然的曲折（只在过渡带内起作用）
      for (let pass = 0; pass < 6; pass++) {
        const o = new Float32Array(bw * bh);
        for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) {
          let s = 0, n = 0;
          for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= bw || yy >= bh) { n++; continue; } s += v[yy * bw + xx]; n++; }
          o[y * bw + x] = s / n;
        }
        v = o;
      }
      for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) {
        const q = y * bw + x, a = v[q];
        if (a <= 0.02 || a >= 0.98 || w0[(y + y0) * FW + x + x0]) continue;
        const gx = x + x0, gy = y + y0;
        const nz = U.noise2(gx * 0.07, gy * 0.07, 7 + k) * 0.65 + U.noise2(gx * 0.2, gy * 0.2, 19 + k) * 0.35 - 0.5;
        v[q] = a + nz * 1.1 * 4 * a * (1 - a);
      }
      // 平滑不能把水面推出多边形或推上林地（如启德跑道这样紧贴填海区的窄条陆地）
      for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) {
        const i = (y + y0) * FW + x + x0;
        if (!w0[i] && (!loc[i] || old[y * bw + x])) v[y * bw + x] = Math.min(v[y * bw + x], 0.45);
      }
      let any = false;
      for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) {
        const i = (y + y0) * FW + x + x0;
        if (v[y * bw + x] >= 0.5 && !w0[i]) { mask[i] = 60001 + k; any = true; }
      }
      fields[k] = any ? { v: v, x0: x0, y0: y0, bw: bw, bh: bh } : null;
    });
    // 并入某填海项：该像素成为填海土地；它与周围 2 像素内的现代水面都并入水面场，不在海中留下岸线
    const absorb = function (q, id) {
      const F = fields[id - 60001]; if (!F) return false;
      const x = q % FW - F.x0, y = ((q / FW) | 0) - F.y0;
      if (x < 0 || y < 0 || x >= F.bw || y >= F.bh) return false;
      mask[q] = id;
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
        const xx = x + dx, yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= F.bw || yy >= F.bh) continue;
        if ((dx || dy) && !w0[(yy + F.y0) * FW + xx + F.x0]) continue;
        F.v[yy * F.bw + xx] = 1;
      }
      return true;
    };
    // 伸入填海前水面的细长陆地（防波堤、河口导堤、码头栈桥）：9×9 邻域内七成以上是水、一成五以上是尚未成陆的填海水面，
    // 一并归入其中最多的填海项。宽度在 6 像素（约 350 m）以上的陆地（如启德的旧跑道）不受影响
    // 只处理与大片陆地相连的部分（小岛按下面的碎片规则处理，主要临外海的小岛如旧台场炮台保持原状）
    const lab = new Int32Array(FW * FH), sizes = [0];
    for (let i0 = 0, stk = []; i0 < FW * FH; i0++) {
      if (w0[i0] || mask[i0] || lab[i0]) continue;
      const L = sizes.length; let n = 0; stk.push(i0); lab[i0] = L;
      while (stk.length) {
        const q = stk.pop(); n++;
        const x = q % FW;
        if (x > 0 && !lab[q - 1] && !w0[q - 1] && !mask[q - 1]) { lab[q - 1] = L; stk.push(q - 1); }
        if (x < FW - 1 && !lab[q + 1] && !w0[q + 1] && !mask[q + 1]) { lab[q + 1] = L; stk.push(q + 1); }
        if (q >= FW && !lab[q - FW] && !w0[q - FW] && !mask[q - FW]) { lab[q - FW] = L; stk.push(q - FW); }
        if (q < FW * (FH - 1) && !lab[q + FW] && !w0[q + FW] && !mask[q + FW]) { lab[q + FW] = L; stk.push(q + FW); }
      }
      sizes.push(n);
    }
    for (let pass = 0; pass < 2; pass++) {
      const add = [];
      fields.forEach(function (F) {
        if (!F) return;
        for (let y = 0; y < F.bh; y++) for (let x = 0; x < F.bw; x++) {
          const gx = x + F.x0, gy = y + F.y0, i = gy * FW + gx;
          if (w0[i] || mask[i] || sizes[lab[i]] <= 200 || gx < 4 || gy < 4 || gx >= FW - 4 || gy >= FH - 4) continue;
          let wet = 0, pend = 0, id = 0, cnt = null;
          for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
            const j = i + dy * FW + dx, m = mask[j];
            if (m) { wet++; pend++; if (!cnt) cnt = new Map(); cnt.set(m, (cnt.get(m) || 0) + 1); } else if (w0[j]) wet++;
          }
          if (wet < 57 || pend < 12) continue;
          let best = -1; cnt.forEach(function (c, m) { if (c > best) { best = c; id = m; } });
          add.push(i, id);
        }
      });
      if (!add.length) break;
      for (let a = 0; a < add.length; a += 2) if (!mask[add[a]]) absorb(add[a], add[a + 1]);
    }
    // 海上的陆地碎片：填海范围旁边的小块现代陆地（之后修的码头、防波堤、人工海滩，或相邻两个填海范围之间的缝隙），
    // 一并归入相邻的填海项，成陆前同样是海面。主要与外海相接的小岛（如东京的旧台场炮台）不受影响
    const seen = new Uint8Array(FW * FH), comp = [], st = [];
    for (let i0 = 0; i0 < FW * FH; i0++) {
      if (w0[i0] || mask[i0] || seen[i0]) continue;
      comp.length = 0; st.length = 0; st.push(i0); seen[i0] = 1;
      let big = false, edge = false, tR = 0, tM = 0;
      const touch = new Map();
      while (st.length) {
        const q = st.pop(); comp.push(q);
        if (comp.length > 200) big = true;
        const x = q % FW, y = (q / FW) | 0;
        if (x === 0 || y === 0 || x === FW - 1 || y === FH - 1) edge = true;
        const nb = [x > 0 ? q - 1 : -1, x < FW - 1 ? q + 1 : -1, y > 0 ? q - FW : -1, y < FH - 1 ? q + FW : -1];
        for (const n of nb) {
          if (n < 0) continue;
          if (mask[n]) { tR++; touch.set(mask[n], (touch.get(mask[n]) || 0) + 1); }
          else if (w0[n]) tM++;
          else if (!seen[n]) { seen[n] = 1; st.push(n); }
        }
      }
      if (big || edge || !tR || tR < 0.25 * (tR + tM)) continue;
      let id = 0, best = -1;
      touch.forEach(function (c, m) { if (c > best) { best = c; id = m; } });
      for (const q of comp) absorb(q, id);
    }
    // 旧跑道不是后来才形成的码头碎片：现代绿地与平滑吸收不能把历史上已有的跑道误算为待填海水面。
    const ap = D.airport, rw = ap && ap.runway, oldEnd = ap && ap.runwayExt && ap.runwayExt.end;
    if (rw && oldEnd) {
      const a = rw[0], b = oldEnd, dx = b[0] - a[0], dy = b[1] - a[1], len2 = dx * dx + dy * dy;
      for (let y = Math.max(0, Math.floor((Math.min(a[1], b[1]) - 0.5) * S)); y < Math.min(FH, Math.ceil((Math.max(a[1], b[1]) + 0.5) * S)); y++) {
        for (let x = Math.max(0, Math.floor((Math.min(a[0], b[0]) - 0.5) * S)); x < Math.min(FW, Math.ceil((Math.max(a[0], b[0]) + 0.5) * S)); x++) {
          const i = y * FW + x, px = (x + 0.5) / S, py = (y + 0.5) / S, t = ((px - a[0]) * dx + (py - a[1]) * dy) / len2;
          if (w0[i] || t < 0 || t > 1 || U.distToSeg(px, py, a[0], a[1], b[0], b[1]) > 0.5) continue;
          mask[i] = 0;
          for (const F of fields) if (F && x >= F.x0 && y >= F.y0 && x < F.x0 + F.bw && y < F.y0 + F.bh) {
            const q = (y - F.y0) * F.bw + x - F.x0; F.v[q] = Math.min(F.v[q], 0.45);
          }
        }
      }
    }
    list.forEach(function (r, k) {
      const F = fields[k];
      if (!F) { parts[k] = null; return; }
      parts[k] = Object.assign({ k: k }, contour(F.v, F.bw, F.bh, F.x0, F.y0, S, function (x, y) { return w0[(y + F.y0) * FW + x + F.x0]; }));
    });
    return this._rcg;
  };
  // 插值等值线（阈值 0.5）：采样点为子像素中心。填充为逐行合并的整格矩形加边界格多边形，岸线为线段；
  // 四角都是现代水面的格不出岸线（平滑场在水中的过渡只影响同色填充，不能画出海中的岸线）
  function contour(v, bw, bh, x0, y0, S, wet) {
    const fill = [], edge = [], T = 0.5;
    let bx0 = 1e9, by0 = 1e9, bx1 = -1e9, by1 = -1e9;
    const X = function (x) { return (x0 + x + 0.5) / S; }, Y = function (y) { return (y0 + y + 0.5) / S; };
    for (let y = 0; y + 1 < bh; y++) {
      let run = -1;
      for (let x = 0; x + 1 <= bw; x++) {
        const full = x + 1 < bw && v[y * bw + x] >= T && v[y * bw + x + 1] >= T && v[(y + 1) * bw + x] >= T && v[(y + 1) * bw + x + 1] >= T;
        if (full) { if (run < 0) run = x; continue; }
        if (run >= 0) { fill.push(new Float32Array([X(run), Y(y), X(x), Y(y), X(x), Y(y + 1), X(run), Y(y + 1)])); run = -1; }
        if (x + 1 >= bw) break;
        const c = [[x, y], [x + 1, y], [x + 1, y + 1], [x, y + 1]], val = c.map(function (p) { return v[p[1] * bw + p[0]]; });
        if (val.every(function (a) { return a < T; })) continue;
        const pts = [], cross = [];
        for (let e = 0; e < 4; e++) {
          const a = c[e], b = c[(e + 1) % 4], va = val[e], vb = val[(e + 1) % 4];
          if (va >= T) pts.push(X(a[0]), Y(a[1]));
          if ((va >= T) !== (vb >= T)) {
            const t = (T - va) / (vb - va), px = X(a[0] + (b[0] - a[0]) * t), py = Y(a[1] + (b[1] - a[1]) * t);
            pts.push(px, py); cross.push(px, py);
          }
        }
        if (pts.length >= 6) fill.push(new Float32Array(pts));
        if (!(wet(x, y) && wet(x + 1, y) && wet(x, y + 1) && wet(x + 1, y + 1))) for (let q = 0; q + 3 < cross.length; q += 4) edge.push(cross[q], cross[q + 1], cross[q + 2], cross[q + 3]);
      }
    }
    for (const p of fill) for (let q = 0; q < p.length; q += 2) { if (p[q] < bx0) bx0 = p[q]; if (p[q] > bx1) bx1 = p[q]; if (p[q + 1] < by0) by0 = p[q + 1]; if (p[q + 1] > by1) by1 = p[q + 1]; }
    return { fill: fill, edge: new Float32Array(edge), bbox: [bx0, by0, bx1, by1] };
  }
  // 尚未成陆的填海范围（平滑后的实际水面，供绘制与线路图使用）：要素格式同 Geo.water（rings 为多边形），另带岸线 edge
  City.prototype.reclaimWater = function () {
    if (!D.reclaim || !D.reclaim.length) return [];
    if (this._reclaimWater && this._reclaimWater.year === this.terrainYear) return this._reclaimWater.features;
    const g = this.reclaimGeom(), out = [], self = this;
    (D.reclaim || []).forEach(function (r, k) {
      if (r.year <= self.terrainYear) return;
      const p = g.parts[k]; if (!p) return;
      if (!p.feat) p.feat = { rings: p.fill.map(function (a) { return { outer: true, p: a }; }), bbox: p.bbox, edge: p.edge, k: k };
      out.push(p.feat);
    });
    this._reclaimWater = { year: this.terrainYear, features: out };
    return out;
  };
  // 水域栅格（值为水体序号：面 1…，线 30001…，尚未填海的海域 60001…）、有符号距离场与每格陆地比例
  City.prototype.buildWater = function () {
    const Geo = CM.Geo, W = this.W, H = this.H, N = this.N, FW = this.FW, FH = this.FH;
    const wm = new Uint16Array(FW * FH);
    Geo.fill(wm, FW, FH, FS, Geo.water, function (f, i) { return i + 1; });
    Geo.waterLines.forEach(function (l, i) { Geo.stroke(wm, FW, FH, FS, l.p, Math.max(l.w / 2, 0.025), 30001 + i); });
    if (!this.landMax) { const cov0 = Geo.coverage(wm, FW, FS, W, H); this.landMax = new Float32Array(N); for (let c = 0; c < N; c++) this.landMax[c] = 1 - cov0[c]; }   // 现代陆地（含全部填海）
    // 尚未成陆的填海范围按平滑后的实际水面（reclaimGeom）计入
    if ((D.reclaim || []).some((r) => r.year > this.terrainYear)) {
      const rm = this.reclaimGeom().mask, rc = D.reclaim;
      for (let i = 0; i < rm.length; i++) if (rm[i] && !wm[i] && rc[rm[i] - 60001].year > this.terrainYear) wm[i] = rm[i];
    }
    this.wmask = wm;
    this.wsdf = Geo.sdf(wm, FW, FH);
    const wcov = Geo.coverage(wm, FW, FS, W, H);
    this.landFrac = new Float32Array(N); this.waterD = new Float32Array(N);
    for (let c = 0; c < N; c++) { this.landFrac[c] = 1 - wcov[c]; this.waterD[c] = this.waterDistAt(c % W + 0.5, ((c / W) | 0) + 0.5); }
  };
  // 运营中的机场范围（数据中的 airport 区域，关闭前）
  City.prototype.isAirportCell = function (c, year) {
    if (!D.airport || year > D.airport.closeYear) return false;   // 关闭当年由 game.js 按月份统一转为普通用地
    const rg = this.regions[this.region[c]];
    return !!rg && rg.id === 'airport';
  };
  // 系统填海：到达年份的填海土地成陆。更新水域、陆地比例、建筑避让、道路跨水标记与新土地的用地；
  // keepLu 为读档恢复时使用（用地等已从存档恢复，只重建地形）。返回本次成陆的填海项
  City.prototype.applyReclaim = function (year, keepLu) {
    const list = (D.reclaim || []).filter((r) => r.year > this.terrainYear && r.year <= year);
    if (year > this.terrainYear) this.terrainYear = year;
    if (!list.length) return list;
    const N = this.N, FW = this.FW, BW = this.BW, BH = this.BH, Geo = CM.Geo, old = this.landFrac;
    this._lkPrevMask = this._lk ? this._lk.mask : null;
    this.buildWater();
    this.terrainVer++;
    const fresh = new Set();
    for (let c = 0; c < N; c++) {
      if (old[c] === this.landFrac[c]) continue;
      this.dirty.add(c);
      if (this.landFrac[c] < 0.5) continue;
      // 风景区内成陆的格与开局时一样作为山林保护（不能留作“陆地上的水域”）
      if (this.regions[this.region[c]].scenic) { if (this.lu[c] === LU.WATER) { this.plan[c] = LU.HILL; this.lu[c] = LU.HILL; fresh.add(c); } continue; }
      // 整体保留为绿地 / 乐园的区域（如竹篙湾迪士尼乐园，v2.2）：成陆后为公园用地，不分配普通住宅与就业
      if (this.regions[this.region[c]].park) { this.plan[c] = LU.PARK; if (this.lu[c] === LU.WATER) { this.lu[c] = LU.PARK; this.isPark[c] = 1; fresh.add(c); } continue; }
      if (this.plan[c] === LU.WATER) this.plan[c] = this.planFor(c);
      // 读档时（keepLu）用地已恢复，通常不会再有“陆地上的水域用地”；若填海年份在新版数据中提前，这里同样补成陆地
      if (this.lu[c] === LU.WATER) { this.lu[c] = this.isAirportCell(c, year) ? LU.AIRPORT : LU.RURAL; fresh.add(c); }   // 机场范围内的填海（如启德跑道延长）成为机场用地
    }
    // 已落成地标场地内刚成陆的格同样受保护（不会变成普通农田再被开发）
    if (fresh.size) for (let k = 0; k < D.landmarks.length; k++) if (this.landmarkOn[k]) this.protectLandmark(k, fresh);
    // 建筑避让：已成陆处去掉水域标记，补上街道
    const wm = this.wmask, bm = this.bmask;
    for (let y = 0; y < BH; y++) for (let x = 0; x < BW; x++) { const i = y * BW + x; if (bm[i] === 3 && !wm[((y >> 1) * FW) + (x >> 1)]) bm[i] = 0; }
    const free = function (v) { return v === 0; };
    for (const r of list) for (const k of Geo.query(Geo.streetBk, r._f.bbox[0], r._f.bbox[1], r._f.bbox[2], r._f.bbox[3])) Geo.stroke(bm, BW, BH, BS, Geo.streets[k].p, 0.035, 1, free);
    // 道路格网的跨水标记
    for (let e = 0; e < this.eBlock.length; e++) this.eBlock[e] = this.edgeBlock(e);
    // 新土地可能把隔开的片区连起来（v2.2 可建设范围按格计算）：范围有变化的格重画
    const prevLock = this._lkPrevMask;
    if (prevLock) { const now = this.lockState().mask; for (let c = 0; c < N; c++) if (prevLock[c] !== now[c]) this.dirty.add(c); }
    this.version++; this.geoVer++;
    return list;
  };
  // 格网边的跨水标记：0 陆地；1 跨越现代水面（快速路、主干道可作为桥梁通行）；
  // 2 位于尚未填海成陆的海面（v2.1）：任何道路都不通行，车辆与行人不会出现在填海前的海上
  City.prototype.edgeBlock = function (e) {
    const uv = this.edgeVerts(e), VW = this.VW;
    const ax = uv[0] % VW, ay = (uv[0] / VW) | 0, bx = uv[1] % VW, by = (uv[1] / VW) | 0, mx = (ax + bx) / 2, my = (ay + by) / 2;
    if (this.waterAt(mx, my) > 60000) return 2;
    return this.waterDistAt(mx, my) < 0.08 || this.crossesRiver(ax, ay, bx, by) ? 1 : 0;
  };

  // 真实地理：水域、绿地、林地、区域（确定性，不随存档保存）
  City.prototype.buildTerrain = function () {
    const Geo = CM.Geo.init(), W = this.W, H = this.H, N = this.N;
    const FW = W * FS, FH = H * FS;
    this.FS = FS; this.FW = FW; this.FH = FH;
    this.buildWater();
    const wm = this.wmask;    // 公园与林地覆盖率
    const pm = new Uint8Array(FW * FH);
    Geo.fill(pm, FW, FH, FS, Geo.parks);
    this.parkCov = Geo.coverage(pm, FW, FS, W, H);
    const wd = new Uint8Array(FW * FH);
    Geo.fill(wd, FW, FH, FS, Geo.woods);
    Geo.fill(wd, FW, FH, FS, Geo.reserves);
    this.wood = Geo.coverage(wd, FW, FS, W, H);
    // 区域：风景区（真实保护区/公园范围）→ 街道 → 所属区 → 外围
    const self = this, regions = this.regions, NONE = 255;
    const rr = new Uint8Array(N).fill(NONE);
    const fillCells = function (feats, k) {
      if (!feats.length) return;
      const tmp = new Uint8Array(N);
      Geo.fill(tmp, W, H, 1, feats);
      for (let c = 0; c < N; c++) if (tmp[c] && rr[c] === NONE) rr[c] = k;
    };
    const streetOf = new Map(), distOf = new Map();
    regions.forEach(function (rg, k) {
      if (rg.geo) {
        // 风景区 / 公园范围，或按行政界线整体划定（geo.admin：嵌在区里的风景区、开发区等，按区域顺序优先于街道与区）
        const list = rg.geo.reserve ? Geo.reserves.filter(function (f) { return f.name === rg.geo.reserve; }) : rg.geo.admin ? Geo.admin.filter(function (f) { return f.name === rg.geo.admin; }) : Geo.parks.filter(function (f) { return f.name === rg.geo.park; });
        fillCells(list, k);
      }
      // 山地风景区按林地覆盖率划定（如香港郊野公园的山体），woodMin 为最低林地覆盖率
      if (rg.woodMin) for (let c = 0; c < N; c++) if (rr[c] === NONE && self.wood[c] >= rg.woodMin && self.landMax[c] >= 0.5) rr[c] = k;
      // 显式多边形（格坐标），可为多个：[[x, y], …] 或 [[[x, y], …], …]
      if (rg.poly) {
        const polys = typeof rg.poly[0][0] === 'number' ? [rg.poly] : rg.poly;
        fillCells(polys.map(function (pl) { const p = new Float32Array([].concat.apply([], pl)); return { rings: [{ outer: true, p: p }], bbox: Geo.bbox(p) }; }), k);
      }
      for (const s of rg.streets || []) if (!streetOf.has(s)) streetOf.set(s, k);
      for (const s of rg.district || []) if (!distOf.has(s)) distOf.set(s, k);
    });
    for (const f of Geo.admin) if (f.level === 8 && streetOf.has(f.name)) fillCells([f], streetOf.get(f.name));
    for (const f of Geo.admin) if ((f.level === 6 || f.level === 7) && distOf.has(f.name)) fillCells([f], distOf.get(f.name));   // 区（东京特别区为 7 级）
    const def = regions.length - 1;
    this.region = new Uint8Array(N);
    for (let c = 0; c < N; c++) this.region[c] = rr[c] === NONE ? def : rr[c];
    this.mergeRegionFragments();
    this.buildHeritage();
    // 区域中心（标注与定位用）与范围
    const sx = new Float64Array(regions.length), sy = new Float64Array(regions.length), sn = new Float64Array(regions.length);
    const bb = regions.map(function () { return [1e9, 1e9, -1e9, -1e9]; });
    const LM = this.landMax;   // 区域范围与标注按现代陆地（含之后的填海）计算
    for (let c = 0; c < N; c++) {
      if (LM[c] < 0.5) continue;
      const k = this.region[c], i = c % W, j = (c / W) | 0;
      sx[k] += i + 0.5; sy[k] += j + 0.5; sn[k]++;
      const b = bb[k]; if (i < b[0]) b[0] = i; if (j < b[1]) b[1] = j; if (i + 1 > b[2]) b[2] = i + 1; if (j + 1 > b[3]) b[3] = j + 1;
    }
    regions.forEach(function (rg, k) {
      // 标注点取离质心最近的本区域格，避免落在别的区域上
      let cx = sn[k] ? sx[k] / sn[k] : W / 2, cy = sn[k] ? sy[k] / sn[k] : H / 2;
      let best = 1e9, bx = cx, by = cy;
      for (let c = 0; c < N; c++) if (self.region[c] === k && LM[c] >= 0.5) { const d = U.dist(c % W + 0.5, ((c / W) | 0) + 0.5, cx, cy); if (d < best) { best = d; bx = c % W + 0.5; by = ((c / W) | 0) + 0.5; } }
      rg.cx = bx; rg.cy = by; rg.bbox = bb[k]; rg.cells = sn[k];
    });
    const ak = regions.findIndex(function (r) { return r.id === 'airport'; });
    this.airportBox = D.airport && ak >= 0 && sn[ak] ? regions[ak].bbox : null;
    // 区名标注位置：所列街道的质心
    this.districtLabels = (D.districtLabels || []).map(function (dl) {
      const feats = Geo.admin.filter(function (f) { return dl[1].indexOf(f.name) >= 0; });
      if (!feats.length) return null;
      const tmp = new Uint8Array(N); Geo.fill(tmp, W, H, 1, feats);
      let x = 0, y = 0, n = 0;
      for (let c = 0; c < N; c++) if (tmp[c] && self.landFrac[c] >= 0.5) { x += c % W + 0.5; y += ((c / W) | 0) + 0.5; n++; }
      return n ? [dl[0], x / n, y / n] : null;
    }).filter(Boolean);
    // 建筑避让栅格：水域、道路、铁路处不放建筑（1 支路，2 干道/铁路，3 水域）
    const BW = W * BS, BH = H * BS;
    this.BS = BS; this.BW = BW; this.BH = BH;
    const bm = new Uint8Array(BW * BH);
    for (let y = 0; y < BH; y++) for (let x = 0; x < BW; x++) if (wm[((y >> 1) * FW) + (x >> 1)]) bm[y * BW + x] = 3;
    const free = function (v) { return v === 0; }, notWater = function (v) { return v < 2; };
    for (const s of Geo.streets) Geo.stroke(bm, BW, BH, BS, s.p, 0.035, 1, free);
    for (const r of Geo.rail) if (!(r.flags & 2)) Geo.stroke(bm, BW, BH, BS, r.p, 0.07, 2, notWater);
    this.bmask = bm;
  };

  // 有符号水域距离（格）：陆地为正，水面为负
  City.prototype.waterDistAt = function (x, y) {
    const S = this.FS, FW = this.FW, FH = this.FH, d = this.wsdf;
    let fx = x * S - 0.5, fy = y * S - 0.5;
    if (fx < 0) fx = 0; if (fy < 0) fy = 0; if (fx > FW - 1.001) fx = FW - 1.001; if (fy > FH - 1.001) fy = FH - 1.001;
    const i = fx | 0, j = fy | 0, u = fx - i, v = fy - j, k = j * FW + i;
    const a = d[k] * (1 - u) + d[k + 1] * u, b = d[k + FW] * (1 - u) + d[k + FW + 1] * u;
    return (a * (1 - v) + b * v) / S;
  };
  City.prototype.waterAt = function (x, y) {
    const i = Math.floor(x * this.FS), j = Math.floor(y * this.FS);
    if (i < 0 || j < 0 || i >= this.FW || j >= this.FH) return 0;
    return this.wmask[j * this.FW + i];
  };
  City.prototype.crossesRiver = function (ax, ay, bx, by) {
    const L = U.dist(ax, ay, bx, by), n = Math.max(1, Math.ceil(L * this.FS));
    for (let k = 0; k <= n; k++) { const t = k / n; if (this.waterAt(ax + (bx - ax) * t, ay + (by - ay) * t)) return true; }
    return false;
  };
  City.prototype.riverNameAt = function (x, y) {
    const Geo = CM.Geo;
    for (let r = 0; r <= 8; r++) {
      for (let a = 0; a < (r ? 16 : 1); a++) {
        const t = a / 16 * Math.PI * 2, id = this.waterAt(x + Math.cos(t) * r / this.FS, y + Math.sin(t) * r / this.FS);
        if (!id) continue;
        if (id > 60000) { const rc = (D.reclaim || [])[id - 60001]; return (rc && rc.sea) || D.seaName || D.riverName || '海'; }
        const f = id > 30000 ? Geo.waterLines[id - 30001] : Geo.water[id - 1];
        if (f && f.name) return f.name;
        if (f) return D.riverName || '珠江';
      }
    }
    return D.riverName || '珠江';
  };

  // 地标场地：旋转矩形（米）内的格
  City.prototype.landmarkCells = function (lm) {
    const out = [], hw = lm.w / 2 / CFG.CELL_M, hd = lm.d / 2 / CFG.CELL_M, a = (lm.rot || 0) * Math.PI / 180, ca = Math.cos(a), sa = Math.sin(a);
    const R = Math.hypot(hw, hd) + 1;
    for (let j = Math.floor(lm.y - R); j <= Math.ceil(lm.y + R); j++) for (let i = Math.floor(lm.x - R); i <= Math.ceil(lm.x + R); i++) {
      if (i < 0 || j < 0 || i >= this.W || j >= this.H) continue;
      const dx = i + 0.5 - lm.x, dy = j + 0.5 - lm.y, u = dx * ca + dy * sa, v = -dx * sa + dy * ca;
      if (Math.abs(u) <= hw + 0.15 && Math.abs(v) <= hd + 0.15) out.push(j * this.W + i);
    }
    const c0 = this.cellAt(lm.x, lm.y);
    if (c0 >= 0 && out.indexOf(c0) < 0) out.push(c0);
    return out;
  };
  // 点是否在地标的真实场地范围内（不含格的粗略误差）
  City.prototype.inLandmarkSite = function (k, x, y) {
    const lm = D.landmarks[k]; if (!lm) return false;
    const a = (lm.rot || 0) * Math.PI / 180, dx = x - lm.x, dy = y - lm.y;
    const u = dx * Math.cos(a) + dy * Math.sin(a), v = -dx * Math.sin(a) + dy * Math.cos(a);
    return Math.abs(u) <= lm.w / 2 / CFG.CELL_M && Math.abs(v) <= lm.d / 2 / CFG.CELL_M;
  };
  // 地标按落成年份出现；建在填海土地上的地标要等场地成陆（中心所在格为陆地）后才出现
  // 可建设范围（v2.2）：未开放区域连成一整块，不出现飞地，也不在已开放城区里夹着未开放的小块——
  //  · 区域开放（regionOpen）决定城市开发；可以建设地铁的范围按格计算。自由建造开启「解锁全图」时，境外等永不开放的区域以外都算开放；
  //  · 从开局城区（开局即开放的区域里最大的一片）出发，与之连成一片的格可以建设；隔着 2.5 km 以内的江面、海湾算相连；
  //  · 风景区随所在区域，运营中的机场（交通枢纽）随连片范围；与连片城区隔开的已开放区域（远处的新市镇等）暂不能建设，连通后即可建设；
  //  · 被可建设范围完全包围的未开放小块（未迁走的水厂、运营中的旧机场等规划用地）可以建设，城市开发仍按参考年份进行。
  // 结果按区域开放状态缓存：mask 为 1 的陆地格不能建设；year 为按参考年份推演的预计开放年份（0 为不开放）
  const LOCK_BRIDGE = 10;
  City.prototype.lockMaskFor = function (open) {
    const W = this.W, N = this.N, reg = this.region, R = this.regions, LF = this.landFrac, host = this.scenicHost, y0 = CFG.START.y;
    const air = !!(D.airport && D.airport.buildable);
    const el = new Uint8Array(N), seed = new Uint8Array(N);
    for (let c = 0; c < N; c++) {
      if (LF[c] < 0.5) continue;
      const k0 = reg[c], k = R[k0].scenic && host && host[c] !== 255 ? host[c] : k0, rg = R[k];
      if (rg.scenic) continue;
      const hub = rg.hub || (air && rg.id === 'airport');
      if (open[k] || hub) el[c] = 1;
      if (!R[k0].scenic && !hub && rg.open != null && rg.open <= y0) seed[c] = 1;
    }
    // 广度优先：陆地格按 pass 通行，水面最多连续跨越 LOCK_BRIDGE 格（wr 记该水面格到岸的最短跨越格数）
    const bfs = function (q, pass, vis, wr) {
      for (let h = 0; h < q.length; h++) {
        const c = q[h], i = c % W, r = LF[c] >= 0.5 ? 0 : wr[c];
        for (let t = 0; t < 4; t++) {
          const v = t === 0 ? (i > 0 ? c - 1 : -1) : t === 1 ? (i < W - 1 ? c + 1 : -1) : t === 2 ? c - W : c + W;
          if (v < 0 || v >= N) continue;
          if (LF[v] >= 0.5) { if (!vis[v] && pass(v)) { vis[v] = 1; q.push(v); } }
          else if (r + 1 <= LOCK_BRIDGE && (!wr[v] || r + 1 < wr[v])) { wr[v] = r + 1; q.push(v); }
        }
      }
    };
    // 连片：从开局城区里种子格最多的一片出发（没有开局城区时取最大的一片）
    const vis = new Uint8Array(N), wr = new Uint8Array(N), comp = new Int32Array(N).fill(-1);
    let best = -1, bestN = 0, id = 0;
    for (const useSeed of [true, false]) {
      for (let s = 0; s < N; s++) {
        if (!el[s] || vis[s] || (useSeed && !seed[s])) continue;
        const q = [s]; vis[s] = 1; wr.fill(0); bfs(q, function (v) { return el[v]; }, vis, wr);
        let ns = 0; for (const c of q) if (LF[c] >= 0.5) { comp[c] = id; if (!useSeed || seed[c]) ns++; }
        if (ns > bestN) { bestN = ns; best = id; }
        id++;
      }
      if (best >= 0) break;
    }
    // 旧存档兼容：已有车站所在的连片同样可以建设（见 keepLegacyOpen）
    const keep = new Set([best]);
    for (const c of this.legacySeeds || []) {
      if (el[c] && comp[c] < 0) {   // 不含开局城区的连片在上面没有编号
        const q = [c]; vis[c] = 1; wr.fill(0); bfs(q, function (v) { return el[v]; }, vis, wr);
        for (const v of q) if (LF[v] >= 0.5) comp[v] = id;
        id++;
      }
      if (comp[c] >= 0) keep.add(comp[c]);
    }
    const inM = function (c) { return keep.has(comp[c]); };
    // 从地图边缘出发、不经过可建设范围能到达的未开放格属于外围的一整块；到达不了的是被包围的小块（可以建设）
    const out = new Uint8Array(N), q = [], H = this.H;
    wr.fill(0);
    for (let c = 0; c < N; c++) {
      const i = c % W, j = (c / W) | 0; if (i && j && i < W - 1 && j < H - 1) continue;
      if (LF[c] >= 0.5) { if (!inM(c)) { out[c] = 1; q.push(c); } } else { wr[c] = 1; q.push(c); }
    }
    bfs(q, function (v) { return !inM(v); }, out, wr);
    const mask = new Uint8Array(N);
    for (let c = 0; c < N; c++) if (LF[c] >= 0.5 && !inM(c) && out[c]) mask[c] = 1;
    return mask;
  };
  City.prototype.lockState = function () {
    const u = !!this.unlockAll, lk = this._lk;
    if (lk && lk.v === this.lockVer && lk.t === this.terrainVer && lk.u === u && lk.reg === this.region) return lk;
    const R = this.regions, n = R.length, N = this.N, open = new Uint8Array(n);
    for (let k = 0; k < n; k++) open[k] = this.regionOpen[k] || (u && R[k].open != null && !R[k].lockNote && !R[k].scenic) ? 1 : 0;
    const mask = this.lockMaskFor(open), year = new Uint16Array(N);
    // 预计开放年份：按尚未开放区域的参考年份依次推演（开放只会让可建设范围变大）
    const ys = Array.from(new Set(R.filter(function (rg, k) { return !open[k] && rg.open != null; }).map(function (rg) { return rg.open; }))).sort(function (a, b) { return a - b; });
    const sim = open.slice();
    for (const Y of ys) {
      for (let k = 0; k < n; k++) if (!sim[k] && R[k].open != null && R[k].open <= Y) sim[k] = 1;
      const m = this.lockMaskFor(sim);
      for (let c = 0; c < N; c++) if (mask[c] && !year[c] && !m[c]) year[c] = Y;
    }
    // 各区域的未开放部分：格数、可建设格数、标注点（离未开放部分质心最近的格）与最常见的预计开放年份
    const info = R.map(function () { return { n: 0, b: 0, sx: 0, sy: 0, years: new Map(), x: null, y: null, year: 0, bd: Infinity }; });
    const W = this.W, LF = this.landFrac, rk = new Uint8Array(N);
    for (let c = 0; c < N; c++) {
      if (LF[c] < 0.5) continue;
      const f = info[rk[c] = this.lockRegion(c)];
      if (!mask[c]) { f.b++; continue; }
      f.n++; f.sx += c % W + 0.5; f.sy += ((c / W) | 0) + 0.5; f.years.set(year[c], (f.years.get(year[c]) || 0) + 1);
    }
    for (const f of info) {
      if (!f.n) continue;
      let bn = 0; f.years.forEach(function (v, y) { if (v > bn) { bn = v; f.year = y; } });
      f.cx = f.sx / f.n; f.cy = f.sy / f.n;
    }
    // 标注点：一次遍历，各区域取离未开放部分质心最近的未开放格
    for (let c = 0; c < N; c++) {
      if (!mask[c]) continue;
      const f = info[rk[c]], x = c % W + 0.5, y = ((c / W) | 0) + 0.5, d = (x - f.cx) * (x - f.cx) + (y - f.cy) * (y - f.cy);
      if (d < f.bd) { f.bd = d; f.x = x; f.y = y; }
    }
    this._lk = { v: this.lockVer, t: this.terrainVer, u: u, reg: this.region, mask: mask, year: year, info: info };
    return this._lk;
  };
  // 旧存档兼容（v2.2）：区域开放年份调整、区域拆分或可建设范围改为按格计算后，旧存档里已有的车站与进行中任务的锚点
  // 不会落在未开放区域——所在区域随之开放，所在的连片保持可以建设。只处理落在不能建设的格上的车站与锚点
  // （规划用地、交通枢纽上的车站本就可以建设，重新载入不提前开放其区域）。任务锚点只在旧存档（没有 lockRule 标记）
  // 首次载入时处理并记下 legacy，之后每次载入沿用，不随重新载入变化。返回因此开放的区域
  City.prototype.keepLegacyOpen = function (net, tasks, y, m) {
    const self = this, seeds = [], opened = [], mask = this.lockState().mask;
    const openAt = function (x, y0) {
      const c = self.cellAt(x, y0); if (c < 0 || !mask[c]) return -1;
      const k = self.lockRegion(c), rg = self.regions[k];
      if (!self.regionOpen[k] && rg.open != null && !rg.scenic && !rg.lockNote) { self.regionOpen[k] = 1; self.regionOpenDate[k] = [y, m]; opened.push(k); }
      return c;
    };
    for (const id in net.stations) { const s = net.stations[id], c = openAt(s.x, s.y); if (c >= 0) seeds.push(c); }
    for (const t of (tasks && tasks.active) || []) for (const a of t.anchors || []) {
      if (!a.legacy && !this.lockRuleOld) continue;
      const c = openAt(a.x, a.y); if (c >= 0) { a.legacy = 1; seeds.push(c); }
    }
    this.lockRuleOld = false;
    this.legacySeeds = seeds.length ? seeds : null;
    if (seeds.length || opened.length) this.lockVer++;
    return opened;
  };
  // 风景区按所在区域计（提示与标注用）
  City.prototype.lockRegion = function (c) { const k = this.region[c]; return this.regions[k].scenic && this.scenicHost && this.scenicHost[c] !== 255 ? this.scenicHost[c] : k; };
  City.prototype.cellLocked = function (c) { return c >= 0 && this.lockState().mask[c] === 1; };
  City.prototype.lockText = function (c) {
    const lk = this.lockState(), y = lk.year[c], k = this.lockRegion(c), rg = this.regions[k];
    if (this.regionOpen[k]) return y ? '尚未与已开放城区连成一片，参考 ' + y + ' 年连通' : '尚未与已开放城区连成一片';
    return y ? '参考 ' + y + ' 年开放' : (rg.lockNote || '不开放');
  };
  // 区域开放提示的补充（v2.2）：开放后仍与城区隔开的，说明连通后才能建设；连带连通的其他区域一并列出
  City.prototype.openNote = function (k) {
    const f = this.lockState().info[k], R = this.regions, linked = (this.lastLinked || []).filter(function (j) { return !R[j].scenic; });
    let s = f.n && !f.b ? '。尚未与已开放城区连成一片，连通后即可建设地铁' : '';
    if (linked.length) s += '。同时与城区连通：' + linked.map(function (j) { return R[j].name; }).join('、');
    return s;
  };
  // 区域状态（界面文字）：整片可以建设 / 部分可以建设 / 尚未开放；未开放但被城区包围的规划用地可以建设，开发按参考年份
  City.prototype.regionLockText = function (k) {
    const f = this.lockState().info[k], rg = this.regions[k];
    if (!f.n) return this.regionOpen[k] || rg.open == null ? '已开放' : '可以建设（规划用地，参考 ' + rg.open + ' 年起开发）';
    // 已开放、但与连片城区隔开（不能建设的部分只因尚未连通）
    if (this.regionOpen[k]) {
      const t = f.year ? '尚未与已开放城区连成一片，参考 ' + f.year + ' 年连通' : '尚未与已开放城区连成一片';
      return f.b ? '部分开放（其余' + t + '）' : t;
    }
    const yr = f.year ? '参考 ' + f.year + ' 年开放' : (rg.lockNote || '不开放');
    return f.b ? '部分开放（其余' + yr + '）' : '尚未开放（' + yr + '）';
  };
  // 区域连片（v2.2）：行政界线栅格化后零星的飞地（不是该区域最大连片且少于 12 格；山地林地划出的风景区少于 4 格）
  // 并入四周占多数的非风景区区域；随后为风景区的每一格记下最近的非风景区区域（scenicHost），开放状态随它
  City.prototype.mergeRegionFragments = function () {
    const W = this.W, N = this.N, reg = this.region, regions = this.regions, LM = this.landMax;
    // 只按陆地格连片：隔着湖面、江面与本区域相连的岸边小块同样算飞地；四周都是水的岛屿保留
    const comp = new Int32Array(N).fill(-1), comps = [], largest = new Int32Array(regions.length);
    for (let c = 0; c < N; c++) if (LM[c] < 0.5) comp[c] = -2;
    for (let s = 0; s < N; s++) {
      if (comp[s] !== -1) continue;
      const k = reg[s], id = comps.length, cells = [s]; comp[s] = id;
      for (let q = 0; q < cells.length; q++) {
        const c = cells[q], i = c % W;
        if (i > 0 && reg[c - 1] === k && comp[c - 1] === -1) { comp[c - 1] = id; cells.push(c - 1); }
        if (i < W - 1 && reg[c + 1] === k && comp[c + 1] === -1) { comp[c + 1] = id; cells.push(c + 1); }
        if (c >= W && reg[c - W] === k && comp[c - W] === -1) { comp[c - W] = id; cells.push(c - W); }
        if (c + W < N && reg[c + W] === k && comp[c + W] === -1) { comp[c + W] = id; cells.push(c + W); }
      }
      comps.push({ k: k, cells: cells });
      if (cells.length > largest[k]) largest[k] = cells.length;
    }
    for (const p of comps) {
      const n = p.cells.length, rg = regions[p.k];
      if (n >= largest[p.k] || (rg.scenic ? n >= 4 || !rg.woodMin : n >= 12)) continue;
      const cnt = new Map(), alt = new Map();   // alt：四周只有风景区时并入风景区
      for (const c of p.cells) {
        const i = c % W;
        for (const nb of [i > 0 ? c - 1 : -1, i < W - 1 ? c + 1 : -1, c - W, c + W]) {
          if (nb < 0 || nb >= N || comp[nb] === -2) continue;
          const k2 = reg[nb]; if (k2 === p.k) continue;
          const m = regions[k2].scenic ? alt : cnt; m.set(k2, (m.get(k2) || 0) + 1);
        }
      }
      let best = -1, bn = 0; (cnt.size ? cnt : alt).forEach(function (v, k2) { if (v > bn) { bn = v; best = k2; } });
      if (best >= 0) for (const c of p.cells) reg[c] = best;
    }
    // 风景区每格的「所在区域」：多源广度优先，取最近的非风景区格的区域
    const host = new Uint8Array(N).fill(255), q = [];
    for (let c = 0; c < N; c++) if (!regions[reg[c]].scenic) { host[c] = reg[c]; q.push(c); }
    for (let h = 0; h < q.length; h++) {
      const c = q[h], i = c % W;
      for (const nb of [i > 0 ? c - 1 : -1, i < W - 1 ? c + 1 : -1, c - W, c + W]) if (nb >= 0 && nb < N && host[nb] === 255) { host[nb] = host[c]; q.push(nb); }
    }
    this.scenicHost = host;
  };
  City.prototype.activateLandmarks = function (year) {
    let changed = false;
    for (let k = 0; k < D.landmarks.length; k++) {
      const lm = D.landmarks[k];
      if (this.landmarkOn[k] || lm.year > year) continue;
      const c0 = this.cellAt(lm.x, lm.y);
      if (c0 >= 0 && this.landFrac[c0] < 0.5) continue;
      this.landmarkOn[k] = 1; changed = true;
      this.protectLandmark(k, null);
    }
    return changed;
  };
  // 地标场地内的陆地格设为受保护（cells 为 null 时处理全部场地格，否则只处理其中的格，如刚成陆的格）
  City.prototype.protectLandmark = function (k, cells) {
    this.geoVer++;
    const lm = D.landmarks[k];
    for (const c of this.landmarkCells(lm)) {
      if (cells && !cells.has(c)) continue;
      if (this.lu[c] === LU.WATER) continue;
      this.protectedId[c] = k + 1;
      // 校园：保留为学校与机构用地（照常生成校舍与人口），只受保护
      if (lm.kind === 'campus') { this.lu[c] = LU.INST; this.plan[c] = LU.INST; this.street[c] = 1; this.dirty.add(c); continue; }
      this.lu[c] = LU.LANDMARK;
      this.pop[c] = 0; this.jobs[c] = Math.min(this.jobs[c], 300);
      this.street[c] = 1;
      this.dirty.add(c);
    }
  };

  // ---------------- 道路 ----------------
  City.prototype.edgeVerts = function (e) {
    const W = this.W, VW = this.VW;
    if (e < this.eOff[1]) { const j = (e / W) | 0, i = e % W; return [j * VW + i, j * VW + i + 1]; }
    if (e < this.eOff[2]) { const k = e - this.eOff[1]; const j = (k / VW) | 0, i = k % VW; return [j * VW + i, (j + 1) * VW + i]; }
    if (e < this.eOff[3]) { const k = e - this.eOff[2]; const j = (k / W) | 0, i = k % W; return [j * VW + i, (j + 1) * VW + i + 1]; }
    const k = e - this.eOff[3]; const j = (k / W) | 0, i = k % W; return [j * VW + i + 1, (j + 1) * VW + i];
  };
  // 两相邻顶点之间的边编号
  City.prototype.edgeBetween = function (i, j, ni, nj) {
    const W = this.W, VW = this.VW;
    if (nj === j) return this.eOff[0] + j * W + Math.min(i, ni);
    if (ni === i) return this.eOff[1] + Math.min(j, nj) * VW + i;
    const ci = Math.min(i, ni), cj = Math.min(j, nj);
    if ((ni - i) * (nj - j) > 0) return this.eOff[2] + cj * W + ci;
    return this.eOff[3] + cj * W + ci;
  };
  // 真实道路分组：同名同级道路为一组（桥梁、隧道单独成组），并确定通车年份
  City.prototype.buildRoadGroups = function () {
    const Geo = CM.Geo, self = this;
    const groups = [], byKey = new Map();
    const yearOfName = function (name, flags, p) {
      if (!name) return null;
      if (D.roadYears[name] != null) return D.roadYears[name];
      if (flags & 3) for (const k in D.bridgeYears) if (name.indexOf(k) >= 0) return D.bridgeYears[k];
      let best = null, bl = 0;
      for (const k in D.roadYears) if (k.length > bl && name.indexOf(k) === 0) { best = D.roadYears[k]; bl = k.length; }
      return best;
    };
    Geo.roads.forEach(function (r) {
      const link = (r.flags & 4) !== 0;
      const key = r.name && !link ? r.name + '|' + r.cls + '|' + (r.flags & 3) : null;
      let g = key ? byKey.get(key) : null;
      if (!g) {
        g = { name: r.name, cls: r.cls, flags: r.flags & 7, ways: [], bbox: [1e9, 1e9, -1e9, -1e9], year: null, notable: false };
        groups.push(g); if (key) byKey.set(key, g);
      }
      g.ways.push(r.p);
      const b = g.bbox; b[0] = Math.min(b[0], r.bbox[0]); b[1] = Math.min(b[1], r.bbox[1]); b[2] = Math.max(b[2], r.bbox[2]); b[3] = Math.max(b[3], r.bbox[3]);
    });
    for (const sr of D.simRoads || []) {
      const p = new Float32Array([].concat.apply([], sr.p));
      groups.push({ name: sr.n, cls: sr.c, flags: 0, ways: [p], bbox: [Math.min.apply(null, sr.p.map(function (q) { return q[0]; })), Math.min.apply(null, sr.p.map(function (q) { return q[1]; })), Math.max.apply(null, sr.p.map(function (q) { return q[0]; })), Math.max.apply(null, sr.p.map(function (q) { return q[1]; }))], year: sr.y, notable: true, sim: true });
    }
    // 年份：名称表 → 跨江桥梁默认 → 所在区域开放年份
    for (const g of groups) {
      if (g.sim) continue;
      const y = yearOfName(g.name, g.flags, g.ways[0]);
      // 只为名称与年份表完全一致的道路/桥梁播报通车（匝道、辅路、出入口不单独播报；已有历史事件的不重复）
      if (y != null) { g.year = y; g.notable = y > CFG.START.y && !(g.flags & 4) && (D.roadYears[g.name] != null || D.bridgeYears[g.name] != null) && !D.events.some(function (e) { return e.title.indexOf(g.name) >= 0; }); continue; }
      let water = 0;
      if (g.flags & 3) for (const p of g.ways) for (let k = 0; k + 3 < p.length; k += 2) if (self.crossesRiver(p[k], p[k + 1], p[k + 2], p[k + 3])) water++;
      if (water >= 2 && (g.flags & 3)) { g.year = D.bridgeDefaultYear; continue; }
      const p = g.ways[0], m = (p.length / 4 | 0) * 2;
      const c = self.cellAt(p[m], p[m + 1]);
      const rg = c >= 0 ? self.regions[self.region[c]] : D.defaultRegion;
      g.year = rg.scenic || rg.open == null ? CFG.START.y : Math.max(CFG.START.y, rg.open);
    }
    // 填海土地上的道路：不早于该处填海成陆的年份（道路有三成以上的点在填海范围内，或桥梁接到填海土地上）
    // 按平滑后的实际填海范围（reclaimGeom）判断，旧陆地上的道路不受多边形近似范围的影响
    const rf = this.reclaimFeats(false), rgm = rf.length ? this.reclaimGeom().mask : null, FW = this.FW, FH = this.FH;
    const inRc = function (x, y, k) { const i = Math.floor(x * FS), j = Math.floor(y * FS); return i >= 0 && j >= 0 && i < FW && j < FH && rgm[j * FW + i] === 60001 + k; };
    if (rf.length) for (const g of groups) {
      for (const f of rf) {
        const a = g.bbox, b = f.bbox;
        if (a[0] > b[2] || a[2] < b[0] || a[1] > b[3] || a[3] < b[1]) continue;
        let n = 0, inside = 0;
        for (const p of g.ways) for (let k = 0; k + 1 < p.length; k += 2) { n++; if (inRc(p[k], p[k + 1], f.k)) inside++; }
        if (inside && (inside >= 0.3 * n || (g.flags & 3))) g.year = Math.max(g.year, D.reclaim[f.k].year);
      }
    }
    this.roadGroups = groups;
    this.roadWays = [];
    groups.forEach(function (g, gi) { for (const p of g.ways) self.roadWays.push({ g: gi, p: p, bbox: CM.Geo.bbox(p) }); });
    this.roadWayBk = CM.Geo.buckets(this.roadWays, 4, this.W, this.H);
    this.roadNames = [''].concat(groups.map(function (g) { return g.name; }));
    this.roadsBuilt = new Uint8Array(groups.length);
  };
  City.prototype.applyRoads = function (year) { const it = this.applyRoadsGen(year); let r = it.next(); while (!r.done) r = it.next(); return r.value; };
  City.prototype.applyRoadsGen = function* (year) {
    let changed = this.updateRail(year);
    const groups = this.roadGroups, BW = this.BW, BH = this.BH, bm = this.bmask;
    const notWater = function (v) { return v < 3; };
    for (let k = 0; k < groups.length; k++) {
      const g = groups[k];
      if (this.roadsBuilt[k] || g.year > year) continue;
      if ((k & 127) === 127) yield;
      this.roadsBuilt[k] = 1; changed = true;
      // 建筑避让
      const hw = g.cls === 4 ? 0.1 : (g.cls === 3 ? 0.075 : 0.05);
      if (!(g.flags & 2)) for (const p of g.ways) Geo2().stroke(bm, BW, BH, BS, p, (g.flags & 4) ? 0.04 : hw, 2, notWater);
      // 车行格网：快速路与主干道（匝道除外）
      if (g.cls >= 3 && !(g.flags & 4)) {
        for (const p of g.ways) {
          for (let q = 0; q + 3 < p.length; q += 2) {
            let i = U.clamp(Math.round(p[q]), 0, this.W), j = U.clamp(Math.round(p[q + 1]), 0, this.H);
            const i1 = U.clamp(Math.round(p[q + 2]), 0, this.W), j1 = U.clamp(Math.round(p[q + 3]), 0, this.H);
            const dx = Math.abs(i1 - i), dy = Math.abs(j1 - j), sx = i < i1 ? 1 : -1, sy = j < j1 ? 1 : -1;
            let err = dx - dy, guard = 0;
            while ((i !== i1 || j !== j1) && guard++ < 1000) {
              const e2 = 2 * err; let ni = i, nj = j;
              if (e2 > -dy) { err -= dy; ni += sx; }
              if (e2 < dx) { err += dx; nj += sy; }
              const e = this.edgeBetween(i, j, ni, nj);
              if (g.cls > this.eArt[e] || (g.cls === this.eArt[e] && g.name && !this.eName[e])) { this.eArt[e] = g.cls; this.eName[e] = k + 1; }
              i = ni; j = nj;
            }
          }
        }
      }
      // 道路沿线的格重新绘制
      const b = g.bbox;
      if (year > CFG.START.y || this.version > 0) for (let jj = Math.max(0, Math.floor(b[1])); jj <= Math.min(this.H - 1, Math.floor(b[3])); jj++) for (let ii = Math.max(0, Math.floor(b[0])); ii <= Math.min(this.W - 1, Math.floor(b[2])); ii++) this.dirty.add(jj * this.W + ii);
    }
    if (changed) { this.version++; this.geoVer++; }
    return changed;
  };
  function Geo2() { return CM.Geo; }
  // ---------------- 地面铁路（v1.9） ----------------
  // 普通铁路不参与乘客出行模拟，但地面铁路（非高架、非隧道）是城市空间的阻隔：在没有道口、地道或天桥的地方阻断步行与支路、次干道。
  // 合法通道 = 真实道路（已通车）或街道（所在街区已开发）跨越铁路的位置；格网边在通道附近（RAIL_R 以内）越过铁路时绕行到通道通过，
  // 否则阻断。主干道与快速路按真实道路处理（立交或道口），不受影响。高架铁路下方可以通行，隧道不构成阻隔。
  // 几何按地图缓存（与年份无关）；铁路是否运营按开通年份（高铁按本地图的高铁年份）每月判断。
  const RAIL_CACHE = new WeakMap(), RAIL_R = 0.7;
  function segT(ax, ay, bx, by, cx, cy, dx, dy) {
    const rx = bx - ax, ry = by - ay, sx = dx - cx, sy = dy - cy, den = rx * sy - ry * sx;
    if (Math.abs(den) < 1e-12) return -1;
    const qx = cx - ax, qy = cy - ay, t = (qx * sy - qy * sx) / den, u = (qx * ry - qy * rx) / den;
    return t < 0 || t > 1 || u < 0 || u > 1 ? -1 : t;
  }
  City.prototype.railGeom = function () {
    const Geo = CM.Geo, W = this.W, H = this.H;
    const hit = RAIL_CACHE.get(Geo.rail);
    if (hit && hit.W === W && hit.H === H && hit.nWays === this.roadWays.length) return hit;
    // 铁路线段：kind 0 地面（含路堤），1 高架；隧道不计
    const ax = [], ay = [], bx = [], by = [], fk = [], kind = [];
    Geo.rail.forEach(function (r, k) {
      if (r.flags & 2) return;
      const p = r.p, kd = (r.flags & 1) ? 1 : 0;
      for (let q = 0; q + 3 < p.length; q += 2) { ax.push(p[q]); ay.push(p[q + 1]); bx.push(p[q + 2]); by.push(p[q + 3]); fk.push(k); kind.push(kd); }
    });
    const n = fk.length, bk = new Array(W * H);
    for (let i = 0; i < n; i++) {
      const i0 = U.clamp(Math.floor(Math.min(ax[i], bx[i])), 0, W - 1), i1 = U.clamp(Math.floor(Math.max(ax[i], bx[i])), 0, W - 1);
      const j0 = U.clamp(Math.floor(Math.min(ay[i], by[i])), 0, H - 1), j1 = U.clamp(Math.floor(Math.max(ay[i], by[i])), 0, H - 1);
      for (let j = j0; j <= j1; j++) for (let ii = i0; ii <= i1; ii++) { const t = j * W + ii; (bk[t] || (bk[t] = [])).push(i); }
    }
    const R = { W: W, H: H, nWays: this.roadWays.length, n: n, ax: Float32Array.from(ax), ay: Float32Array.from(ay), bx: Float32Array.from(bx), by: Float32Array.from(by), fk: Int32Array.from(fk), kind: Uint8Array.from(kind), bk: bk };
    // 线段 (x0,y0)-(x1,y1) 与地面铁路的交点
    const surfHits = function (x0, y0, x1, y1, cb) {
      const i0 = U.clamp(Math.floor(Math.min(x0, x1)), 0, W - 1), i1 = U.clamp(Math.floor(Math.max(x0, x1)), 0, W - 1);
      const j0 = U.clamp(Math.floor(Math.min(y0, y1)), 0, H - 1), j1 = U.clamp(Math.floor(Math.max(y0, y1)), 0, H - 1);
      for (let j = j0; j <= j1; j++) for (let ii = i0; ii <= i1; ii++) {
        const list = bk[j * W + ii]; if (!list) continue;
        for (const s of list) {
          if (R.kind[s]) continue;
          const t = segT(x0, y0, x1, y1, R.ax[s], R.ay[s], R.bx[s], R.by[s]);
          if (t >= 0) cb(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, s);
        }
      }
    };
    R.surfHits = surfHits;
    // 合法通道：真实道路（g ≥ 0 为道路组）与街道（g = −1）跨越地面铁路的位置
    const cx = [], cy = [], cg = [];
    const scan = function (p, g) { for (let q = 0; q + 3 < p.length; q += 2) surfHits(p[q], p[q + 1], p[q + 2], p[q + 3], function (x, y) { cx.push(x); cy.push(y); cg.push(g); }); };
    for (const w of this.roadWays) scan(w.p, w.g);
    for (const s of Geo.streets) scan(s.p, -1);
    const cbk = new Array(W * H);
    for (let i = 0; i < cx.length; i++) { const t = U.clamp(Math.floor(cy[i]), 0, H - 1) * W + U.clamp(Math.floor(cx[i]), 0, W - 1); (cbk[t] || (cbk[t] = [])).push(i); }
    R.cross = { x: Float32Array.from(cx), y: Float32Array.from(cy), g: Int32Array.from(cg), bk: cbk };
    // 格网边越过地面铁路的位置（每条边每条铁路线最多记一次）
    const ee = [], ex = [], ey = [], ek = [];
    const nTot = this.eCls.length, VW = this.VW;
    for (let e = 0; e < nTot; e++) {
      const uv = this.edgeVerts(e), x0 = uv[0] % VW, y0 = (uv[0] / VW) | 0, x1 = uv[1] % VW, y1 = (uv[1] / VW) | 0;
      let lastK = -1;
      surfHits(x0, y0, x1, y1, function (x, y, s) { const k = R.fk[s]; if (k === lastK) return; lastK = k; ee.push(e); ex.push(x); ey.push(y); ek.push(k); });
    }
    R.edge = { e: Int32Array.from(ee), x: Float32Array.from(ex), y: Float32Array.from(ey), k: Int32Array.from(ek) };
    RAIL_CACHE.set(Geo.rail, R);
    return R;
  };
  City.railActiveAt = function (r, year) { return !((r.year && year < r.year) || ((r.flags & 16) && year < (D.hsrYear || 2009))); };
  // 按年份更新运营中的铁路；返回是否有变化（新线开通时需要重建步行与道路网络）
  City.prototype.updateRail = function (year) {
    const rail = CM.Geo.rail || [];
    const on = new Uint8Array(rail.length);
    let changed = !this.railOn || this.railOn.length !== on.length;
    for (let k = 0; k < rail.length; k++) { on[k] = City.railActiveAt(rail[k], year) ? 1 : 0; if (!changed && on[k] !== this.railOn[k]) changed = true; }
    this.railOn = on; this.railYear = year; if (changed) this.geoVer++;
    return changed && this.version > 0;
  };
  // 每条格网边的铁路状态：eRail 0 无、1 绕行到附近通道（eRailDet 为附加米数）、2 阻断
  City.prototype.computeRailBlock = function () {
    const nTot = this.eCls.length;
    if (!this.eRail || this.eRail.length !== nTot) { this.eRail = new Uint8Array(nTot); this.eRailDet = new Float32Array(nTot); }
    const eR = this.eRail, eD = this.eRailDet;
    eR.fill(0); eD.fill(0);
    if (!this.railOn || !this.railOn.some(function (v) { return v; })) return;
    const R = this.railGeom(), W = this.W, H = this.H, C = R.cross, E = R.edge, st = this.street, built = this.roadsBuilt;
    const legal = (i) => {
      const g = C.g[i];
      if (g >= 0) return !!built[g];
      const ci = Math.floor(C.x[i]), cj = Math.floor(C.y[i]);
      for (let j = cj - 1; j <= cj + 1; j++) for (let ii = ci - 1; ii <= ci + 1; ii++) if (ii >= 0 && j >= 0 && ii < W && j < H && st[j * W + ii]) return true;
      return false;
    };
    for (let q = 0; q < E.e.length; q++) {
      const e = E.e[q];
      if (!this.railOn[E.k[q]] || eR[e] === 2) continue;
      const x = E.x[q], y = E.y[q];
      let best = Infinity;
      for (let j = Math.max(0, Math.floor(y - RAIL_R)); j <= Math.min(H - 1, Math.floor(y + RAIL_R)); j++) for (let i = Math.max(0, Math.floor(x - RAIL_R)); i <= Math.min(W - 1, Math.floor(x + RAIL_R)); i++) {
        const list = C.bk[j * W + i]; if (!list) continue;
        for (const c of list) { const d = U.dist(x, y, C.x[c], C.y[c]); if (d < best && d <= RAIL_R && legal(c)) best = d; }
      }
      if (best === Infinity) { eR[e] = 2; eD[e] = 0; }
      else { eR[e] = 1; eD[e] = Math.max(eD[e], 2 * Math.max(0, best - 0.15) * CFG.CELL_M); }
    }
  };
  // 折线与运营中铁路的交叉：surf 地面铁路、via 高架铁路；同一走廊的多股轨道（相距不足约 150 m）计为一处
  City.prototype.railCross = function (pts) {
    const out = { surf: [], via: [] };
    if (!this.railOn || !CM.Geo.rail.length) return out;
    const R = this.railGeom(), W = this.W, H = this.H, on = this.railOn;
    for (let q = 0; q + 1 < pts.length; q++) {
      const x0 = pts[q][0], y0 = pts[q][1], x1 = pts[q + 1][0], y1 = pts[q + 1][1];
      const i0 = U.clamp(Math.floor(Math.min(x0, x1)), 0, W - 1), i1 = U.clamp(Math.floor(Math.max(x0, x1)), 0, W - 1);
      const j0 = U.clamp(Math.floor(Math.min(y0, y1)), 0, H - 1), j1 = U.clamp(Math.floor(Math.max(y0, y1)), 0, H - 1);
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        const list = R.bk[j * W + i]; if (!list) continue;
        for (const s of list) {
          if (!on[R.fk[s]]) continue;
          const t = segT(x0, y0, x1, y1, R.ax[s], R.ay[s], R.bx[s], R.by[s]); if (t < 0) continue;
          const x = x0 + (x1 - x0) * t, y = y0 + (y1 - y0) * t, arr = R.kind[s] ? out.via : out.surf;
          if (!arr.some(function (p) { return U.dist(p[0], p[1], x, y) < 0.6; })) arr.push([x, y, R.fk[s]]);
        }
      }
    }
    return out;
  };
  // 到最近的运营中地面铁路的距离（格，只查 1.5 格以内）
  City.prototype.railDist = function (x, y) {
    if (!this.railOn || !CM.Geo.rail.length) return Infinity;
    const R = this.railGeom(), W = this.W, H = this.H;
    let best = Infinity;
    for (let j = Math.max(0, Math.floor(y - 1.5)); j <= Math.min(H - 1, Math.floor(y + 1.5)); j++) for (let i = Math.max(0, Math.floor(x - 1.5)); i <= Math.min(W - 1, Math.floor(x + 1.5)); i++) {
      const list = R.bk[j * W + i]; if (!list) continue;
      for (const s of list) { if (R.kind[s] || !this.railOn[R.fk[s]]) continue; const d = segDist(x, y, R.ax[s], R.ay[s], R.bx[s], R.by[s]); if (d < best) best = d; }
    }
    return best;
  };
  function segDist(px, py, ax, ay, bx, by) {
    const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy;
    let t = L > 0 ? ((px - ax) * dx + (py - ay) * dy) / L : 0; t = t < 0 ? 0 : (t > 1 ? 1 : t);
    return Math.hypot(ax + dx * t - px, ay + dy * t - py);
  }

  // 根据街区开发情况生成支路与次干道（系统建设）
  City.prototype.updateStreets = function () {
    const W = this.W, H = this.H, Z = CFG.ZONE, st = this.street;
    const cls = this.eCls;
    cls.set(this.eArt);
    const hasSt = function (i, j) { return i >= 0 && j >= 0 && i < W && j < H && st[j * W + i] === 1; };
    // 横向边 (i,j)-(i+1,j)：相邻格 (i,j-1) 与 (i,j)
    for (let j = 0; j <= H; j++) {
      for (let i = 0; i < W; i++) {
        const e = this.eOff[0] + j * W + i;
        if (this.eBlock[e]) continue;
        if (hasSt(i, j - 1) || hasSt(i, j)) {
          const want = (j % Z === 0) ? 2 : 1;
          if (cls[e] < want) cls[e] = want;
        }
      }
    }
    for (let j = 0; j < H; j++) {
      for (let i = 0; i <= W; i++) {
        const e = this.eOff[1] + j * this.VW + i;
        if (this.eBlock[e]) continue;
        if (hasSt(i - 1, j) || hasSt(i, j)) {
          const want = (i % Z === 0) ? 2 : 1;
          if (cls[e] < want) cls[e] = want;
        }
      }
    }
  };

  // 构建步行图（CSR）与汽车图（收缩后的路段 + 小区连接线）
  // 分步执行（v2.5 性能）：月结时每步之间让出主线程；结果与一次算完相同
  City.prototype.buildGraphs = function () { const it = this.buildGraphsGen(); while (!it.next().done); };
  City.prototype.buildGraphsGen = function* () {
    const V = this.V, VW = this.VW, nTot = this.eCls.length;
    const vx = this.vx, vy = this.vy, CM_ = CFG.CELL_M;
    // 地面铁路：没有通道处阻断支路与次干道（含步行），有通道时绕行（v1.9）
    this.computeRailBlock();
    yield;
    const eRail = this.eRail, eDet = this.eRailDet;
    // ---- 步行 ----
    const wDeg = new Int32Array(V + 1);
    const walkable = new Uint8Array(nTot);
    for (let e = 0; e < nTot; e++) {
      const c = this.eCls[e];
      if (c < 1 || c === 4) continue;
      if ((this.eBlock[e] && c < 3) || this.eBlock[e] === 2) continue;
      if (eRail[e] === 2 && c < 3) continue;
      walkable[e] = 1;
      const uv = this.edgeVerts(e); wDeg[uv[0]]++; wDeg[uv[1]]++;
    }
    const wStart = new Int32Array(V + 1);
    for (let v = 0; v < V; v++) wStart[v + 1] = wStart[v] + wDeg[v];
    const wTo = new Int32Array(wStart[V]), wLen = new Float32Array(wStart[V]);
    const fill = new Int32Array(V);
    for (let e = 0; e < nTot; e++) {
      if (!walkable[e]) continue;
      const uv = this.edgeVerts(e), a = uv[0], b = uv[1];
      const L = U.dist(vx[a], vy[a], vx[b], vy[b]) * CM_ + (this.eCls[e] < 3 ? eDet[e] : 0);
      wTo[wStart[a] + fill[a]] = b; wLen[wStart[a] + fill[a]] = L; fill[a]++;
      wTo[wStart[b] + fill[b]] = a; wLen[wStart[b] + fill[b]] = L; fill[b]++;
    }
    this.walk = { start: wStart, to: wTo, len: wLen, deg: wDeg };

    yield;
    // ---- 汽车 ----
    // New pedestrian streets often leave the car graph exactly unchanged. Compare
    // all effective inputs instead of rebuilding contraction, snapping and OD links.
    const prior = this._carInputs;
    const rules = CFG.CELL_M + '|' + CFG.ZONE + '|' + CFG.road.speed.join(',') + '|' + CFG.road.cap.join(',');
    let same = !!(this.car && prior && prior.rules === rules && prior.ways === this.roadWays && prior.cls.length === nTot && prior.vx.length === V);
    if (same) for (let v = 0; v < V; v++) if (prior.vx[v] !== vx[v] || prior.vy[v] !== vy[v]) { same = false; break; }
    const carOn = function (e, c) { return c >= 2 && this.eBlock[e] !== 2 && !(c < 3 && (this.eBlock[e] || eRail[e] === 2)); }.bind(this);
    const detOf = function (e, c) { return c < 3 ? eDet[e] : 0; };
    if (same && !prior.det) same = false;
    if (same) for (let e = 0; e < nTot; e++) {
      const c = this.eCls[e], active = carOn(e, c);
      if (prior.cls[e] !== (active ? c : 0) || prior.name[e] !== (active ? this.eName[e] : 0) || prior.block[e] !== (active ? this.eBlock[e] : 0) || prior.det[e] !== (active ? Math.fround(detOf(e, c)) : 0)) { same = false; break; }
    }
    if (same) { this.roadVersion++; return; }
    const cDeg = new Int32Array(V);
    const carE = [];
    for (let e = 0; e < nTot; e++) {
      const c = this.eCls[e];
      if (!carOn(e, c)) continue;
      carE.push(e);
      const uv = this.edgeVerts(e); cDeg[uv[0]]++; cDeg[uv[1]]++;
    }
    const cStart = new Int32Array(V + 1);
    for (let v = 0; v < V; v++) cStart[v + 1] = cStart[v] + cDeg[v];
    const cEdge = new Int32Array(cStart[V]);
    const cf = new Int32Array(V);
    for (const e of carE) {
      const uv = this.edgeVerts(e);
      cEdge[cStart[uv[0]] + cf[uv[0]]++] = e;
      cEdge[cStart[uv[1]] + cf[uv[1]]++] = e;
    }
    const forced = new Uint8Array(V);
    for (let v = 0; v < V; v++) {
      const d = cDeg[v];
      if (d === 0) continue;
      if (d !== 2) { forced[v] = 1; continue; }
      const e1 = cEdge[cStart[v]], e2 = cEdge[cStart[v] + 1];
      if (this.eCls[e1] !== this.eCls[e2] || this.eName[e1] !== this.eName[e2]) forced[v] = 1;
    }
    yield;
    // 小区连接点
    const Z = CFG.ZONE, ZW = this.W / Z, ZH = this.H / Z;
    const zoneCand = [];
    for (let zj = 0; zj < ZH; zj++) {
      for (let zi = 0; zi < ZW; zi++) {
        const cx = zi * Z + Z / 2, cy = zj * Z + Z / 2;
        const cand = [];
        for (let rad = 1; rad <= 9 && cand.length === 0; rad += (rad < 3 ? 2 : 3)) {
          for (let j = Math.max(0, zj * Z - rad); j <= Math.min(this.H, zj * Z + Z + rad); j++) {
            for (let i = Math.max(0, zi * Z - rad); i <= Math.min(this.W, zi * Z + Z + rad); i++) {
              const v = j * VW + i;
              if (cDeg[v] > 0) cand.push([v, U.dist(vx[v], vy[v], cx, cy)]);
            }
          }
        }
        cand.sort(function (a, b) { return a[1] - b[1]; });
        const pick = [];
        for (const cnd of cand) {
          if (pick.length >= 3) break;
          let ok = true;
          for (const p of pick) if (U.dist(vx[p[0]], vy[p[0]], vx[cnd[0]], vy[cnd[0]]) < 1.6) ok = false;
          if (ok) pick.push(cnd);
        }
        for (const p of pick) forced[p[0]] = 1;
        zoneCand.push(pick);
      }
    }
    yield;
    // 收缩路段
    const visited = new Uint8Array(nTot);
    const links = [];
    const self = this;
    function walkChain(s, e0) {
      const verts = [s];
      let cur = s, e = e0, lenM = 0, bridge = 0, guard = 0;
      for (;;) {
        visited[e] = 1;
        const uv = self.edgeVerts(e);
        const nxt = uv[0] === cur ? uv[1] : uv[0];
        lenM += U.dist(vx[cur], vy[cur], vx[nxt], vy[nxt]) * CM_ + detOf(e, self.eCls[e]);
        if (self.eBlock[e]) bridge = 1;
        verts.push(nxt);
        if (forced[nxt] || guard++ > 5000) break;
        let ne = -1;
        for (let k = cStart[nxt]; k < cStart[nxt + 1]; k++) if (cEdge[k] !== e) { ne = cEdge[k]; break; }
        if (ne < 0 || visited[ne]) break;
        cur = nxt; e = ne;
      }
      links.push({ verts: verts, lenM: lenM, cls: self.eCls[e0], name: self.eName[e0], bridge: bridge });
    }
    for (let v = 0; v < V; v++) {
      if (!forced[v]) continue;
      for (let k = cStart[v]; k < cStart[v + 1]; k++) if (!visited[cEdge[k]]) walkChain(v, cEdge[k]);
    }
    for (const e of carE) if (!visited[e]) { const uv = this.edgeVerts(e); forced[uv[0]] = 1; walkChain(uv[0], e); }

    // 节点编号
    const vertNode = new Int32Array(V).fill(-1);
    const nodeVert = [];
    const nodeOf = function (v) { if (vertNode[v] < 0) { vertNode[v] = nodeVert.length; nodeVert.push(v); } return vertNode[v]; };
    for (const L of links) { L.a = nodeOf(L.verts[0]); L.b = nodeOf(L.verts[L.verts.length - 1]); }
    const nN = nodeVert.length, nA = links.length * 2;
    const arcFrom = new Int32Array(nA), arcTo = new Int32Array(nA), arcLen = new Float32Array(nA), arcCap = new Float32Array(nA), arcT0 = new Float32Array(nA);
    const outDeg = new Int32Array(nN + 1);
    for (let k = 0; k < links.length; k++) {
      const L = links[k];
      L.id = k;
      L.key = Math.min(L.verts[0], L.verts[L.verts.length - 1]) + '_' + Math.max(L.verts[0], L.verts[L.verts.length - 1]) + '_' + L.verts.length;
      const cap = CFG.road.cap[L.cls] * (L.bridge ? 0.75 : 1);
      const t0 = L.lenM / (CFG.road.speed[L.cls] * 1000 / 60);
      arcFrom[2 * k] = L.a; arcTo[2 * k] = L.b; arcFrom[2 * k + 1] = L.b; arcTo[2 * k + 1] = L.a;
      arcLen[2 * k] = arcLen[2 * k + 1] = L.lenM;
      arcCap[2 * k] = arcCap[2 * k + 1] = cap;
      arcT0[2 * k] = arcT0[2 * k + 1] = Math.max(0.05, t0);
      outDeg[L.a]++; outDeg[L.b]++;
      // 几何
      let pts = L.verts.map(function (v) { return [vx[v], vy[v]]; });
      // 贴合真实道路线形（车辆沿真实道路行驶）；无法贴合的格网连接线只参与模拟、不显示车辆
      const real = L.name ? this.snapToRoad(L.name, pts) : null;
      if (real) { pts = real; L.real = true; }
      else if (L.cls >= 3 && pts.length > 2) pts = U.chaikin(pts, 2);
      L.pts = pts; L.cum = U.cumLen(pts);
      let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
      for (const p of pts) { if (p[0] < x0) x0 = p[0]; if (p[0] > x1) x1 = p[0]; if (p[1] < y0) y0 = p[1]; if (p[1] > y1) y1 = p[1]; }
      L.bbox = [x0, y0, x1, y1];
    }
    const outStart = new Int32Array(nN + 1);
    for (let n = 0; n < nN; n++) outStart[n + 1] = outStart[n] + outDeg[n];
    const outArc = new Int32Array(nA);
    const of = new Int32Array(nN);
    for (let a = 0; a < nA; a++) { const f = arcFrom[a]; outArc[outStart[f] + of[f]++] = a; }
    const zoneConn = zoneCand.map(function (pick) {
      return pick.map(function (p) {
        const m = p[1] * CM_;
        return { node: vertNode[p[0]], t: m / 250 + 1.0, km: m / 1000 };
      }).filter(function (c) { return c.node >= 0; });
    });
    this.car = { nN: nN, nA: nA, nodeVert: nodeVert, vertNode: vertNode, arcFrom: arcFrom, arcTo: arcTo, arcLen: arcLen, arcCap: arcCap, arcT0: arcT0, outStart: outStart, outArc: outArc, links: links, zoneConn: zoneConn };

    // 主干道旁的格（用于新区沿路开发）
    this.nearArt = new Uint8Array(this.N);
    for (let e = 0; e < nTot; e++) {
      if (this.eCls[e] < 3) continue;
      const uv = this.edgeVerts(e);
      for (const v of uv) {
        const i = v % VW, j = (v / VW) | 0;
        for (let dj = -1; dj <= 0; dj++) for (let di = -1; di <= 0; di++) {
          const ci = i + di, cj = j + dj;
          if (ci >= 0 && cj >= 0 && ci < this.W && cj < this.H) this.nearArt[cj * this.W + ci] = 1;
        }
      }
    }
    const inputs = { rules: rules, ways: this.roadWays, vx: Float64Array.from(vx), vy: Float64Array.from(vy), cls: new Uint8Array(nTot), name: new Int32Array(nTot), block: new Uint8Array(nTot), det: new Float32Array(nTot) };
    for (let e = 0; e < nTot; e++) {
      const c = this.eCls[e];
      if (!carOn(e, c)) continue;
      inputs.cls[e] = c; inputs.name[e] = this.eName[e]; inputs.block[e] = this.eBlock[e]; inputs.det[e] = detOf(e, c);
    }
    this._carInputs = inputs;
    this.roadVersion++;
  };

  // 把格网路段投影到所属真实道路上，取两端投影点之间的真实折线
  function projPoly(p, x, y) {
    let best = { d: 1e9, k: 0, t: 0, s: 0 }, acc = 0;
    for (let k = 0; k + 3 < p.length; k += 2) {
      const ax = p[k], ay = p[k + 1], dx = p[k + 2] - ax, dy = p[k + 3] - ay, L2 = dx * dx + dy * dy, L = Math.sqrt(L2);
      let t = L2 > 0 ? ((x - ax) * dx + (y - ay) * dy) / L2 : 0; t = t < 0 ? 0 : (t > 1 ? 1 : t);
      const qx = ax + dx * t - x, qy = ay + dy * t - y, d = Math.sqrt(qx * qx + qy * qy);
      if (d < best.d) best = { d: d, k: k / 2, t: t, s: acc + L * t, x: ax + dx * t, y: ay + dy * t };
      acc += L;
    }
    return best;
  }
  City.prototype.snapToRoad = function (name, pts) {
    const g = this.roadGroups[name - 1]; if (!g) return null;
    const a = pts[0], b = pts[pts.length - 1];
    let latLen = 0; for (let k = 1; k < pts.length; k++) latLen += U.dist(pts[k - 1][0], pts[k - 1][1], pts[k][0], pts[k][1]);
    let best = null, bd = 1.5;
    for (const p of g.ways) {
      const A = projPoly(p, a[0], a[1]); if (A.d > 0.8) continue;
      const B = projPoly(p, b[0], b[1]); if (B.d > 0.8) continue;
      const len = Math.abs(B.s - A.s);
      if (len < latLen * 0.35 || len > latLen * 2.5 + 0.5) continue;
      if (A.d + B.d < bd) { bd = A.d + B.d; best = [p, A, B]; }
    }
    if (!best) return null;
    const p = best[0], A = best[1], B = best[2], out = [[A.x, A.y]];
    if (A.s <= B.s) { for (let k = A.k + 1; k <= B.k; k++) out.push([p[2 * k], p[2 * k + 1]]); }
    else { for (let k = A.k; k > B.k; k--) out.push([p[2 * k], p[2 * k + 1]]); }
    out.push([B.x, B.y]);
    return out.length >= 2 ? out : null;
  };

  // ---------------- 建筑高度 ----------------
  City.prototype.heightFor = function (c, year) {
    const L = this.lu[c];
    const pd = this.pop[c] / CELL_KM2, jd = this.jobs[c] / CELL_KM2;
    const hsh = U.hash2(c, 7, this.seed);
    let h = 0, cap = 400;
    const era = year < 1995 ? 0 : (year < 2005 ? 1 : 2);
    switch (L) {
      case LU.RES: h = 6 + 0.0011 * pd + 0.0004 * jd; cap = [21, 75, 150][era]; break;
      case LU.MIX: h = 8 + 0.0009 * (pd + jd); cap = [25, 90, 170][era]; break;
      case LU.COM: h = 10 + 0.0016 * jd + 0.0005 * pd; cap = [48, 180, 380][era]; break;
      case LU.IND: h = 7 + 0.00025 * jd; cap = 26; break;
      case LU.INST: h = 10 + 0.0003 * (pd + jd); cap = 45; break;
      case LU.RURAL: h = (pd + jd) > 300 ? 5 : 0; cap = 8; break;
      default: return 0;
    }
    // 历史限高（可选）：区域的 maxHeight 优先，其次地图的 maxHeight（如巴黎 1950 年代以前约 20 m 檐口 + 屋顶、1977 年起市内限高）
    const rg = this.regions[this.region[c]], mh = (rg && rg.maxHeight) || D.maxHeight;
    if (mh) cap = Math.min(cap, U.interp(mh, year));
    return Math.min(cap, h) * (0.8 + 0.4 * hsh);
  };

  // ---------------- 区域 ----------------
  City.prototype.regionAt = function (x, y) { const c = this.cellAt(x, y); return c < 0 ? null : this.regions[this.region[c]]; };
  City.prototype.openRegion = function (k, y, m) {
    if (this.regionOpen[k]) return false;
    this.regionOpen[k] = 1; this.regionOpenDate[k] = [y, m];
    // 可建设范围可能连带变化（连通的已开放片区、被包围的规划用地），这些格也要重画；
    // lastLinked：因此由「整片不能建设」变为可以建设的其他区域（开放提示用）
    const prev = this._lk, before = prev && prev.mask;
    this.lockVer++;
    const now = this.lockState(), after = now.mask;
    for (let c = 0; c < this.N; c++) if (this.region[c] === k || (before && before[c] !== after[c])) this.dirty.add(c);
    this.lastLinked = prev ? this.regions.map(function (r, j) { return j; }).filter(function (j) { return j !== k && !prev.info[j].b && prev.info[j].n && now.info[j].b; }) : [];
    this.version++;
    return true;
  };
  City.prototype.closeAirport = function () {
    let n = 0;
    for (let c = 0; c < this.N; c++) {
      if (this.lu[c] === LU.AIRPORT) { this.lu[c] = LU.RURAL; this.dirty.add(c); n++; }
    }
    if (n) { this.version++; this.geoVer++; }
  };

  City.prototype.totals = function () {
    let p = 0, j = 0;
    for (let c = 0; c < this.N; c++) { p += this.pop[c]; j += this.jobs[c]; }
    return { pop: p, jobs: j };
  };

  // ---------------- 城市发展（每月） ----------------
  // ctx: { year, monthIndex, zoneAccess (Float32Array 0..1), cellWalk (Float32Array m), coverage, econ, pull }
  // pull（v2.3 地铁带动发展，可空）：{ field 每格的车站吸引, M 线网成熟度 0–1, w 车站吸引的权重 }，见 Game.metroPull
  // econ（城市经济，可空）：popGrowth 人口增速系数、jobs 就业水平系数、com 商业发展系数。只调整增速与就业水平，
  // 长期人口仍回到本城的人口曲线；地铁覆盖对人口的吸引（boost）不经过经济系数，避免重复计算
  City.prototype.growMonth = function (ctx) {
    const N = this.N, W = this.W, year = ctx.year;
    const tot = this.totals();
    const E = ctx.econ || null, egp = E ? E.popGrowth : 1, ejf = E ? E.jobs : 1, ecom = E ? E.com : 1;
    const boost = 1 + CFG.growth.metroBoostMax * U.clamp((ctx.coverage || 0) / 0.5, 0, 1);
    const target = U.interp(CFG.growth.popCurve, year + 1 / 12) * boost;
    const targetNow = U.interp(CFG.growth.popCurve, year) * boost;
    let dP = (target - targetNow) * egp + 0.04 * (targetNow - tot.pop);
    dP = Math.max(dP, -0.002 * tot.pop);
    const tJ = target * U.interp(CFG.growth.jobsRatio, year + 1 / 12) * ejf;
    let dJ = (tJ - tot.jobs) * 0.12 + Math.max(0, dP) * U.interp(CFG.growth.jobsRatio, year) * 0.3;
    dJ = Math.max(dJ, -0.002 * tot.jobs);
    const eraMul = year < 2000 ? 0.8 : (year < 2010 ? 0.8 + 0.2 * (year - 2000) / 10 : Math.min(1.15, 1 + 0.15 * (year - 2010) / 20));
    // 历史发展阶段（v2.2，eras.js）：片区增长权重与疏解。疏解把成熟片区的一小部分岗位 / 人口放回本月的分配量，
    // 总量不变（就业中心迁移、旧城疏解），再按增长权重分配到其他地方
    const EF = CM.Eras && CM.Eras.enabled() ? CM.Eras.regionFactors(this, year) : null;
    if (EF) {
      let mJ = 0, mP = 0;
      for (let c = 0; c < N; c++) {
        const k = this.region[c], rj = EF.relocJ[k], rp = EF.relocP[k];
        if (rj > 0 && this.jobs[c] > 0) { const v = this.jobs[c] * rj; this.jobs[c] -= v; mJ += v; }
        if (rp > 0 && this.pop[c] > 0) { const v = this.pop[c] * rp; this.pop[c] -= v; mP += v; }
      }
      dJ += mJ; dP += mP;
    }
    // 地铁带动发展（v2.3）：线网越成熟，增长越多地跟着车站与枢纽走（吸引权重 pw），历史阶段预设的片区权重越弱（flat）；
    // 车站周边可容纳的人口与岗位随之提高。只改变增长落在哪里，全城总量仍按人口曲线
    const PL = ctx.pull || null, GL = CFG.metroLed, pw = PL ? PL.w : 0, flat = PL ? 1 - GL.flatten * PL.M : 1;
    const wR = new Float32Array(N), wJ = new Float32Array(N), capR = new Float32Array(N), capJ = new Float32Array(N);
    let sR = 0, sJ = 0;
    const mi = ctx.monthIndex;
    for (let c = 0; c < N; c++) {
      const L = this.lu[c];
      if (L === LU.WATER || L === LU.HILL || L === LU.PARK || L === LU.AIRPORT || L === LU.LANDMARK) continue;
      if (!this.regionOpen[this.region[c]]) continue;
      const lf = this.landFrac[c] * (1 - this.taken[c]);
      if (lf <= 0.05) continue;
      const P = L === LU.RURAL ? this.plan[c] : L;
      const pf = PL ? PL.field[c] : 0;
      const cr = resCap(P) * eraMul * lf * (1 + GL.capR * pw * Math.min(1.5, pf)), cj = jobCap(P, this.regions[this.region[c]].plan) * eraMul * lf * (1 + GL.capJ * pw * Math.min(2, pf));
      capR[c] = cr; capJ[c] = cj;
      const i = c % W, j = (c / W) | 0;
      let nb = 0;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        if (!di && !dj) continue;
        const ii = i + di, jj = j + dj;
        if (ii >= 0 && jj >= 0 && ii < W && jj < this.H && this.street[jj * W + ii]) nb++;
      }
      nb /= 8;
      const walk = ctx.cellWalk ? ctx.cellWalk[c] : Infinity;
      const st = walk < 500 ? 1 : (walk < 850 ? 0.55 : (walk < 1125 ? 0.22 : 0));
      const acc = ctx.zoneAccess ? ctx.zoneAccess[this.zoneOf(c)] : 0.3;
      let seed = 1;
      if (!this.street[c]) {
        if (nb < 0.2 && st === 0 && !this.nearArt[c]) continue;
        seed = 0.35 + (this.nearArt[c] ? 0.3 : 0);
      }
      const rnd = 0.6 + 0.8 * U.hash2(c, mi, this.seed + 31);
      const remR = cr - this.pop[c], remJ = cj - this.jobs[c];
      const kR = EF ? Math.pow(EF.pop[this.region[c]], flat) : 1, kJ = EF ? Math.pow(EF.jobs[this.region[c]], flat) : 1;
      if (remR > 0) { wR[c] = remR * (0.25 + acc) * (1 + 1.6 * st) * (0.3 + nb) * rnd * seed * kR * (1 + GL.res * pw * pf); sR += wR[c]; }
      if (remJ > 0) {
        const comBoost = (P === LU.COM || P === LU.MIX) ? 2.0 * ecom : 1;
        wJ[c] = remJ * (0.2 + acc * 1.2) * (1 + 1.6 * st * comBoost) * (0.3 + nb) * rnd * seed * kJ * (1 + GL.jobs * pw * pf * (comBoost > 1 ? 1.3 : 1)); sJ += wJ[c];
      }
    }
    const changed = [];
    const add = (arr, cap, w, s, d) => {
      if (d > 0 && s > 0) {
        let left = d;
        for (let pass = 0; pass < 2 && left > 1; pass++) {
          const k = left / s; let used = 0, s2 = 0;
          for (let c = 0; c < N; c++) {
            if (w[c] <= 0) continue;
            const room = cap[c] - arr[c];
            const inc = Math.min(room, w[c] * k, Math.max(60, cap[c] * 0.05));
            if (inc > 0) { arr[c] += inc; used += inc; changed.push(c); }
            if (cap[c] - arr[c] > 1) s2 += w[c]; else w[c] = 0;
          }
          left -= used; s = s2;
          if (s <= 0) break;
        }
      } else if (d < 0) {
        let tot2 = 0; for (let c = 0; c < N; c++) tot2 += arr[c];
        const f = 1 + d / Math.max(1, tot2);
        for (let c = 0; c < N; c++) arr[c] *= f;
      }
    };
    add(this.pop, capR, wR, sR, dP);
    add(this.jobs, capJ, wJ, sJ, dJ);
    let newUrban = 0, streetsChanged = false;
    const seen = new Set();
    // 工地（只用于画面上的塔吊，不参与模拟、不存档）：新城市化或明显加高的街区，记录开工月份
    const sites = this.sites || (this.sites = new Map());
    for (const [c, m0] of sites) if (mi - m0 > 24) sites.delete(c);
    for (const c of changed) {
      if (seen.has(c)) continue; seen.add(c);
      if (!this.street[c] && this.pop[c] + this.jobs[c] > 160) {
        this.street[c] = 1; this.urbanYear[c] = Math.floor(year);
        if (this.lu[c] === LU.RURAL) this.lu[c] = this.plan[c] === LU.PARK ? LU.RES : this.plan[c];
        newUrban++; streetsChanged = true; this.dirty.add(c); sites.set(c, mi);
      }
      const nh = this.heightFor(c, year);
      if (nh > this.bh[c] * 1.12 + 1) { if (nh - this.bh[c] >= 6) sites.set(c, mi); this.bh[c] = nh; this.dirty.add(c); }
    }
    if (streetsChanged) { this.updateStreets(); }
    if (changed.length) this.version++;
    return { dPop: dP, dJobs: dJ, newUrban: newUrban, streetsChanged: streetsChanged };
  };
  function resCap(L) {
    switch (L) { case LU.RES: return 3000; case LU.MIX: return 2200; case LU.COM: return 600; case LU.IND: return 160; case LU.INST: return 700; default: return 300; }
  }
  function jobCap(L, plan) {
    switch (L) {
      case LU.COM: return plan === 'cbd' ? 12500 : 8000;
      case LU.MIX: return 3500; case LU.IND: return 1900; case LU.INST: return 1600; case LU.RES: return 450; default: return 150;
    }
  }

  // 地铁设施拆迁：按比例减少用地
  City.prototype.demolish = function (c, frac) {
    if (c < 0 || frac <= 0) return;
    const f = U.clamp(frac, 0, 1 - this.taken[c]);
    if (f <= 0) return;
    const keep = 1 - f / Math.max(0.05, 1 - this.taken[c]);
    this.pop[c] *= keep; this.jobs[c] *= keep;
    this.taken[c] += f;
    this.dirty.add(c);
    this.version++;
  };

  // ---------------- 存档 ----------------
  City.prototype.serialize = function () {
    const out = {
      seed: this.seed,
      pop: U.packTyped(this.pop, 'f32'), jobs: U.packTyped(this.jobs, 'f32'), bh: U.packTyped(this.bh, 'f32'),
      taken: U.packTyped(this.taken, 'f32'), lu: U.packTyped(this.lu, 'u8'), street: U.packTyped(this.street, 'u8'),
      urbanYear: U.packTyped(this.urbanYear, 'u16'),
      regionOpen: Array.from(this.regionOpen), regionOpenDate: this.regionOpenDate,
      landmarkOn: Array.from(this.landmarkOn),
      // 稳定标识（v2.1 起）：区域与地标按 id 对应，地图版本增删区域或地标后旧存档仍能正确恢复
      regionIds: this.regions.map(function (r) { return r.id; }), landmarkIds: D.landmarks.map(function (l) { return l.id; }),
    };
    if (D.terrainRevision) out.terrainRevision = D.terrainRevision;
    if (D.displayRevision) out.displayRevision = D.displayRevision;
    out.lockRule = 2;
    return out;
  };
  // 按 id 把存档中的区域 / 地标状态对应到当前数据；没有 id 的旧存档按数组位置对应
  function byIds(savedIds, curIds, vals) {
    if (!savedIds) return curIds.map(function (id, k) { return vals[k]; });
    const at = new Map(); savedIds.forEach(function (id, k) { at.set(id, k); });
    return curIds.map(function (id) { return at.has(id) ? vals[at.get(id)] : undefined; });
  }
  City.byIds = byIds;
  // 地图扩展：mask 为 1 的格（新增范围）取「按 year 年生成的城市」的状态；人口按该年人口曲线在全图分配后的份额，
  // 城市化判断按人口增长放大密度。只在迁移后的首次载入执行一次，之后随存档保存
  City.prototype.fillNewCells = function (mask, year) {
    const T = new City();
    const p0 = U.interp(CFG.growth.popCurve, CFG.START.y), p1 = U.interp(CFG.growth.popCurve, year);
    T.generate(this.seed, year, { densityScale: Math.max(1, p1 / Math.max(1, p0)) });
    const keys = ['pop', 'jobs', 'bh', 'taken', 'lu', 'street', 'urbanYear'];
    let n = 0, oldP = 0, oldJ = 0, newP = 0, newJ = 0;
    for (let c = 0; c < this.N; c++) {
      if (!mask[c]) { oldP += this.pop[c]; oldJ += this.jobs[c]; continue; }
      for (const k of keys) this[k][c] = T[k][c];
      newP += this.pop[c]; newJ += this.jobs[c];
      n++;
    }
    const tJ = p1 * U.interp(CFG.growth.jobsRatio, year);
    const fP = newP > 0 ? U.clamp((p1 - oldP) / newP, 0.5, 3) : 1, fJ = newJ > 0 ? U.clamp((tJ - oldJ) / newJ, 0.5, 3) : 1;
    for (let c = 0; c < this.N; c++) if (mask[c]) { this.pop[c] *= fP; this.jobs[c] *= fJ; }
    this.filled = { year: year, cells: n, fP: +fP.toFixed(3), fJ: +fJ.toFixed(3) };
    return n;
  };
  City.prototype.restore = function (s, year) { const it = this.restoreGen(s, year); let r = it.next(); while (!r.done) r = it.next(); };
  City.prototype.restoreGen = function* (s, year) {
    this.lockRuleOld = (s.lockRule || 1) < 2; this.lockVer++; this._lk = null;
    const N = this.N;
    const chk = function (a, n) { if (a.length !== n) throw new Error('城市数据尺寸不符'); return a; };
    this.pop = chk(U.unpackTyped(s.pop), N); this.jobs = chk(U.unpackTyped(s.jobs), N); this.bh = chk(U.unpackTyped(s.bh), N);
    this.taken = chk(U.unpackTyped(s.taken), N); this.lu = chk(U.unpackTyped(s.lu), N); this.street = chk(U.unpackTyped(s.street), N);
    this.urbanYear = chk(U.unpackTyped(s.urbanYear), N);
    // 地图扩展迁移：新增范围的格按存档年份重新生成（见 maps.js CM.extentMigration），原有范围保持存档状态
    const fill = s.fillNew ? chk(U.unpackTyped(s.fillNew), N) : null;
    if (fill) this.fillNewCells(fill, s.fillYear || year);
    // 区域开放状态按 id 恢复；本版本新增、存档中没有的区域按存档年份判断是否已开放
    const rIds = this.regions.map(function (r) { return r.id; });
    const ro = byIds(s.regionIds, rIds, s.regionOpen || []), rd = byIds(s.regionIds, rIds, s.regionOpenDate || []);
    const fy = s.fillYear || year;
    this.regionOpen = new Uint8Array(this.regions.length); this.regionOpenDate = this.regions.map(function () { return null; });
    for (let k = 0; k < this.regions.length; k++) {
      if (ro[k] !== undefined) { this.regionOpen[k] = ro[k] ? 1 : 0; this.regionOpenDate[k] = rd[k] || null; }
      else { const rg = this.regions[k]; if (rg.open != null && rg.open <= fy && (rg.id !== 'airport' || !D.airport)) { this.regionOpen[k] = 1; this.regionOpenDate[k] = [rg.open, 1]; } }
      // 同一网页版格网内的展示修订；不接受独立版扩图数据，也不平移玩家线网。
      const rg = this.regions[k];
      if (D.displayRevision && (s.displayRevision || 1) < D.displayRevision && ((CM.mapId === 'hz' && rg.id === 'jianqiao') || (!D.airport && rg.id === 'airport')) && rg.open != null && rg.open <= year && !this.regionOpen[k]) {
        this.regionOpen[k] = 1; this.regionOpenDate[k] = [rg.open, 1];
      }
    }
    this.landmarkOn = new Uint8Array(D.landmarks.length);
    this.protectedId.fill(0);
    const lIds = D.landmarks.map(function (l) { return l.id; });
    // 本版本新增的地标：位于新增范围（已按存档年份生成）且已落成的直接启用；其余由下一次月度更新按年份启用
    const self = this;
    const on = byIds(s.landmarkIds, lIds, s.landmarkOn || []).map(function (v, k) {
      if (v !== undefined) return v;
      const lm = D.landmarks[k], c = self.cellAt(lm.x, lm.y);
      return fill && c >= 0 && fill[c] && lm.year <= fy ? 1 : 0;
    });
    for (let k = 0; k < D.landmarks.length; k++) {
      if (!on[k]) continue;
      this.landmarkOn[k] = 1;
      for (const c of this.landmarkCells(D.landmarks[k])) if (this.lu[c] === LU.LANDMARK || (D.landmarks[k].kind === 'campus' && this.lu[c] !== LU.WATER)) this.protectedId[c] = k + 1;
    }
    // v2.3 位置校正后，旧存档里地标原址留下的场地格不再属于任何地标：恢复为规划用地，之后照常开发；
    // 地标新址的格在下一次月度更新时按年份启用并受保护
    for (let c = 0; c < N; c++) if (this.lu[c] === LU.LANDMARK && !this.protectedId[c]) this.lu[c] = this.plan[c] === LU.LANDMARK ? LU.RES : this.plan[c];
    for (let k = 0; k < D.landmarks.length; k++) if (this.landmarkOn[k] && !this.landmarkCells(D.landmarks[k]).some((c) => this.protectedId[c] === k + 1)) this.landmarkOn[k] = 0;
    this.applyReclaim(year, true);   // 历史海岸线恢复到存档年份（用地已从存档恢复）
    this.applyReplan(year, true);
    // 同范围地形修订：填海 / 机场边界校正及武汉河渠异常宽度修复，按当前地理重新核验旧档用地。
    // 旧存档的用地与新地形不一致的格就地修正：陆地上的水域格补成陆地，仍是海面的格改回水域，机场用地按新范围
    if ((s.terrainRevision || 1) < (D.terrainRevision || 1)) {
      const airportOpen = D.airport && year <= D.airport.closeYear && this.lu.indexOf(LU.AIRPORT) >= 0;
      for (let c = 0; c < N; c++) {
        const wet = this.waterD[c] < 0 && this.landFrac[c] < 0.5;
        if (wet) {
          if (this.lu[c] !== LU.WATER) { this.lu[c] = LU.WATER; this.plan[c] = LU.WATER; this.pop[c] = 0; this.jobs[c] = 0; this.bh[c] = 0; }
          continue;
        }
        if (this.lu[c] === LU.WATER && this.landFrac[c] >= 0.5) {
          if (this.regions[this.region[c]].scenic) { this.lu[c] = LU.HILL; if (this.plan[c] === LU.WATER) this.plan[c] = LU.HILL; continue; }
          if (this.plan[c] === LU.WATER) this.plan[c] = this.planFor(c);
          this.lu[c] = airportOpen && this.isAirportCell(c, year) ? LU.AIRPORT : LU.RURAL;
          continue;
        }
        if (!airportOpen) continue;
        const inAp = this.isAirportCell(c, year);
        if (inAp && this.lu[c] !== LU.AIRPORT && this.lu[c] !== LU.HILL && (D.airport.runwayExt || this.lu[c] !== LU.PARK)) { this.lu[c] = LU.AIRPORT; this.pop[c] = 0; this.jobs[c] = 0; this.bh[c] = 0; }
        else if (!inAp && this.lu[c] === LU.AIRPORT) { this.lu[c] = LU.RURAL; if (this.plan[c] === LU.WATER) this.plan[c] = this.planFor(c); }
      }
    }
    if (D.displayRevision && (s.displayRevision || 1) < D.displayRevision && !D.airport) {
      for (let c = 0; c < N; c++) if (this.lu[c] === LU.AIRPORT) {
        this.lu[c] = LU.RURAL; this.plan[c] = this.planFor(c); this.bh[c] = 0;
      }
    }
    // Newly defined park / protected areas retain their intended land use after upgrade.
    for (let c = 0; c < N; c++) if (this.regions[this.region[c]].park && this.landFrac[c] >= 0.5 && this.lu[c] === LU.RURAL) { this.lu[c] = this.plan[c] = LU.PARK; this.isPark[c] = 1; }
    this.eArt.fill(0); this.eName.fill(0); this.roadsBuilt.fill(0);
    yield;
    yield* this.applyRoadsGen(year);
    this.updateStreets();
    yield;
    yield* this.buildGraphsGen();
    this.version++; this.geoVer++;
    for (let c = 0; c < N; c++) this.dirty.add(c);
  };
})(window.CM);
