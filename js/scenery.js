'use strict';
// Canvas scenery shares facility data with the simulation; it never changes demand.
(function (CM) {
  const U = CM.U, CFG = CM.CFG, D = CM.DATA, LU = CM.LU, Renderer = CM.Renderer;
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
  Renderer.prototype.lockOutline = function (k) {
    const city = this.game.city, LK = city.lockState(), key = city.terrainVer + ':' + k;
    const cache = this._lockOl && this._lockOl.city === city && this._lockOl.lk === LK ? this._lockOl : (this._lockOl = { city: city, lk: LK, map: new Map() });
    if (cache.map.has(key)) return cache.map.get(key);
    const W = city.W, H = city.H, land = function (c) { return city.landFrac[c] >= 0.5; };
    // 只取该区域里不能建设的部分（v2.2 按格判断）
    const eff = function (c) { return LK.mask[c] ? city.lockRegion(c) : -1; };
    const adj = new Map(), add = function (a, b) { (adj.get(a) || adj.set(a, []).get(a)).push(b); (adj.get(b) || adj.set(b, []).get(b)).push(a); }, vid = function (i, j) { return j * (W + 1) + i; };
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
      const c = j * W + i; if (eff(c) !== k || !land(c)) continue;
      if (i + 1 < W && land(c + 1) && eff(c + 1) !== k) add(vid(i + 1, j), vid(i + 1, j + 1));
      if (i > 0 && land(c - 1) && eff(c - 1) !== k) add(vid(i, j), vid(i, j + 1));
      if (j + 1 < H && land(c + W) && eff(c + W) !== k) add(vid(i, j + 1), vid(i + 1, j + 1));
      if (j > 0 && land(c - W) && eff(c - W) !== k) add(vid(i, j), vid(i + 1, j));
    }
    const used = new Set(), ek = function (a, b) { return a < b ? a + ':' + b : b + ':' + a; }, out = [];
    const walk = function (s) {   // 从端点（度 ≠ 2）或任意点沿未走过的边走到底
      const pts = [s]; let cur = s;
      for (;;) { const nx = (adj.get(cur) || []).find(function (n) { return !used.has(ek(cur, n)); }); if (nx == null) break; used.add(ek(cur, nx)); pts.push(nx); cur = nx; }
      return pts;
    };
    const verts = [...adj.keys()].sort(function (a, b) { return (adj.get(a).length === 2) - (adj.get(b).length === 2); });
    for (const v of verts) while ((adj.get(v) || []).some(function (n) { return !used.has(ek(v, n)); })) {
      let p = walk(v).map(function (q) { return [q % (W + 1), Math.floor(q / (W + 1))]; });
      if (p.length < 3) continue;
      const closed = p[0][0] === p[p.length - 1][0] && p[0][1] === p[p.length - 1][1];
      for (let it = 0; it < 2; it++) {   // Chaikin 平滑：去掉格子的阶梯感
        const q = closed ? [] : [p[0]];
        for (let i = 0; i + 1 < p.length; i++) { const a = p[i], b = p[i + 1]; q.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25], [a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]); }
        if (closed) q.push(q[0]); else q.push(p[p.length - 1]);
        p = q;
      }
      out.push(p);
    }
    cache.map.set(key, out.length ? out : null);
    return cache.map.get(key);
  };
  Renderer.prototype.runwaySeg = function (city) {
    let rw = D.airport && D.airport.runway;
    const rx = D.airport && D.airport.runwayExt, rxr = rx && (D.reclaim || []).find(function (r) { return r.id === rx.reclaim; });
    if (rw && rxr && rxr.year > city.terrainYear) rw = [rw[0], rx.end];
    const ab = city.airportBox;
    if (!rw && ab) { const cx = (ab[0] + ab[2]) / 2, len = (ab[3] - ab[1]) * 0.78, y0 = (ab[1] + ab[3]) / 2 - len / 2; rw = [[cx, y0], [cx, y0 + len]]; }
    return rw || null;
  };
  Renderer.prototype.hubModels = function (city, yr) {
    const Fac = CM.Fac, out = [];
    if (!Fac || !D.facilities) return out;
    const nearRail = function (x, y) {
      let best = 3.2, res = null;   // 设施点距铁路 800 m 内时站房贴着铁路建
      for (const r of CM.Geo.rail || []) {
        if ((r.flags & 2) || (r.year && yr < r.year) || ((r.flags & 16) && yr < (D.hsrYear || 2009))) continue;   // 与地面图一致：地下段、未开通的线不算
        const b = r.bbox; if (x < b[0] - best || x > b[2] + best || y < b[1] - best || y > b[3] + best) continue;
        for (let q = 0; q + 3 < r.p.length; q += 2) {
          const ax = r.p[q], ay = r.p[q + 1], dx = r.p[q + 2] - ax, dy = r.p[q + 3] - ay, L2 = dx * dx + dy * dy || 1;
          const t = U.clamp(((x - ax) * dx + (y - ay) * dy) / L2, 0, 1), px = ax + dx * t, py = ay + dy * t, d = Math.hypot(x - px, y - py);
          if (d < best) { best = d; res = { x: px, y: py, ang: Math.atan2(dy, dx), d: d }; }
        }
      }
      return res;
    };
    // 机场用地：运营中的机场格，或交通枢纽区域（如香港国际机场）内的陆地
    const isAirC = function (c) { return c >= 0 && (city.lu[c] === LU.AIRPORT || (city.regions[city.region[c]].hub && city.landFrac[c] >= 0.5)); };
    for (const f of Fac.list(city)) {
      if ((f.t !== 'rail' && f.t !== 'air') || f.lmK >= 0 || f.ext || !Fac.active(f, yr, city)) continue;
      if (f.t === 'rail') {
        const r = nearRail(f.x, f.y);
        if (r) {
          const tx = Math.cos(r.ang), ty = Math.sin(r.ang), cross = tx * (f.y - r.y) - ty * (f.x - r.x);
          out.push({ id: 'h' + f.id, x: r.x, y: r.y, lm: { id: 'st_' + f.id, kind: 'station2', x: r.x, y: r.y, w: 260, d: 150, rot: r.ang * 180 / Math.PI, h: 16, side: cross < 0 ? -1 : 1, tracks: true, name: f.name } });
        } else out.push({ id: 'h' + f.id, x: f.x, y: f.y, lm: { id: 'st_' + f.id, kind: 'station2', x: f.x, y: f.y, w: 140, d: 60, rot: 0, h: 16, side: 1, tracks: false, name: f.name } });
        continue;
      }
      // 机场（v2.2 按实际体量）：航站楼长约跑道的 1/6（320–560 m），前方约 280 m 深的停机坪与滑行道，停机坪外缘距跑道中线约 110 m
      // 跑道：设施自带的（香港国际机场）→ 本图跑道表里离设施最近、已启用的（v2.6.1 玩家反馈：首都机场、希思罗没写 rw，跑道画了却没有航站楼）→ 旧机场的主跑道；
      // 都没有时（早年的草地机场）以设施为中心取一条约 1.5 km 的东西向跑道
      let rwT = null, rwD = 4;
      for (const r of D.runways || []) { if (yr < r.from) continue; const d = U.distToSeg(f.x, f.y, r.a[0], r.a[1], r.b[0], r.b[1]); if (d <= rwD) { rwD = d; rwT = [r.a, r.b]; } }
      let rw = f.rw || rwT || this.runwaySeg(city), x, y, rot, rwLen, rwOff;
      if (!rw || U.distToSeg(f.x, f.y, rw[0][0], rw[0][1], rw[1][0], rw[1][1]) > 4) rw = [[f.x - 3, f.y], [f.x + 3, f.y]];
      const CMM = CFG.CELL_M, apD = 280;
      const ux = rw[1][0] - rw[0][0], uy = rw[1][1] - rw[0][1], ul = Math.hypot(ux, uy) || 1, tx = ux / ul, ty = uy / ul, nx = -ty, ny = tx;
      rwLen = ul * CMM;
      // 选址：在跑道两侧、沿跑道的不同位置试放，取占地内机场陆地最多、离设施最近的一处（不压到水面与城区）
      // 机场用地不足（如早年的启德只有跑道北端一小片）时依次缩小航站楼与停机坪；图内运营中的机场都要有模型，机场用地放不下时放在普通陆地上
      let sg = 1, fit = false;
      for (const strict of [true, false]) {
        for (const k of [1, 0.78, 0.6, 0.45]) {
          const Tm = U.clamp(rwLen / 6, 320, 640) * k, dd = apD * Math.max(0.7, k), hw = Tm * 1.7 / 2 / CMM, hd = dd / 2 / CMM;
          let best = -Infinity, cov = 0;
          for (const s of [-1, 1]) for (let a = -0.12; a <= 0.881; a += 0.03) for (const off of [dd / 2 + 110, dd / 2 + 70]) {
            const cxp = rw[0][0] + tx * ul * a + nx * s * off / CMM, cyp = rw[0][1] + ty * ul * a + ny * s * off / CMM;
            let good = 0, tot = 0;
            for (let p = -1; p <= 1.001; p += 0.25) for (let q = -1; q <= 1.001; q += 0.5) {
              const px = cxp + tx * p * hw + nx * s * q * hd, py = cyp + ty * p * hw + ny * s * q * hd, c = city.cellAt(px, py); tot++;
              if ((strict ? isAirC(c) : c >= 0 && city.landFrac[c] >= 0.5) && city.waterDistAt(px, py) > 0.05) good++;
            }
            const sc = good / tot - U.dist(cxp, cyp, f.x, f.y) * 0.01;
            if (sc > best) { best = sc; cov = good / tot; x = cxp; y = cyp; rwOff = off; sg = s; this._apK = k; this._apD = dd; }
          }
          if (cov >= 0.6) { fit = true; break; }
        }
        if (fit) break;
      }
      if (!fit) continue;
      // u 沿跑道，+v（停机坪一侧）指向跑道
      rot = Math.atan2(ty, tx) * 180 / Math.PI; if (sg > 0) rot += 180;
      const T = U.clamp(rwLen / 6, 320, 640) * this._apK;
      out.push({ id: 'h' + f.id, x: x, y: y, lm: { id: 'air_' + f.id, kind: 'airport', x: x, y: y, w: T * 1.7, d: this._apD, T: T, rwOff: rwOff, rot: rot, h: 46, name: f.name } });
    }
    return out;
  };
  // 任务设施模型（v2.2）：没有地标数据的设施（真实设施与片区生成设施）在场地上补一座示意建筑，只用于画面，
  // 体量按类型、外观按地图风格；附近已有地标代表它时不重复建模。模型覆盖的格不再生成普通楼宇。
  // [kind, 宽, 深, 高（米）]
  const FAC_KIND = { hosp: ['hospital', 150, 110, 34], uni: ['campus', 460, 340, 20], shop: ['mall', 190, 140, 28], cbd: ['cluster', 190, 150, 140],
    park: ['garden', 230, 190, 8], stadium: ['stadium', 230, 190, 28], venue: ['expo', 380, 260, 22], scenic: ['temple', 140, 160, 14] };
  Renderer.prototype.facModelSpec = function (f) {
    const pa = this.game.mapId === 'pa' && !f.gen, n = f.name;   // 巴黎老城的医院、百货为石砌庭院建筑；郊区片区生成的设施为现代建筑
    let s = FAC_KIND[f.t].slice(), style = null;
    if (f.t === 'scenic') {
      if (/迪士尼|乐园/.test(n)) { s = ['themepark', 820, 660, 60]; style = 'castle'; }   // 东京迪士尼乐园约 51 公顷
      else if (/动物园|飞禽/.test(n)) { s = ['garden', 240, 200, 8]; style = 'zoo'; }
      else if (/湿地|公园|风景区|山|森林|江滩|海滩|沙滩|公墓/.test(n)) s = ['garden', 220, 180, 8];
      else if (/博物馆|美术馆|文化|创意|坊|宋城/.test(n)) s = ['museum', 160, 120, 16];
      else if (pa) s = ['palace', 160, 120, 20];
    } else if (f.t === 'stadium' && /马场/.test(n)) { s = ['stadium', 620, 380, 18]; style = 'race'; }
    else if (pa && f.t === 'hosp') s = ['palace', 200, 150, 22];
    else if (pa && (f.t === 'shop' || f.t === 'cbd') && !/拉德芳斯|左岸|普莱耶尔|四季/.test(n)) s = ['colonial', 160, 110, 26];
    return { kind: s[0], w: s[1], d: s[2], h: s[3], style: style };
  };
  Renderer.prototype.facModels = function (city, yr) {
    const Fac = CM.Fac, out = [];
    if (!Fac || !D.facilities || !city.region) return out;
    const lms = D.landmarks || [], W = city.W, BS = city.BS, BW = city.BW, bm = city.bmask, CMM = CFG.CELL_M, old = this._facm ? this._facm.byId : null, used = new Set();
    const foot = function (x, y, w, d) {   // 模型覆盖的格（格中心落在占地范围内）
      const hw = w / 2 / CMM, hd = d / 2 / CMM, out = [], c0 = city.cellAt(x, y);
      for (let j = Math.floor(y - hd); j <= Math.floor(y + hd); j++) for (let i = Math.floor(x - hw); i <= Math.floor(x + hw); i++) {
        if (i < 0 || j < 0 || i >= W || j >= city.H) continue;
        if (Math.abs(i + 0.5 - x) <= hw + 0.15 && Math.abs(j + 0.5 - y) <= hd + 0.15) out.push(j * W + i);
      }
      if (c0 >= 0 && out.indexOf(c0) < 0) out.push(c0);
      return out;
    };
    this._facFoot = foot;
    for (const f of Fac.list(city)) {
      if (f.lmK >= 0 || f.ext || f.noModel || !FAC_KIND[f.t] || !Fac.active(f, yr, city)) continue;
      const c0 = city.cellAt(f.x, f.y), inScenic = c0 >= 0 && !!city.regions[city.region[c0]].scenic;
      // 附近已有地标代表这个设施（片区类按片区半径，点状设施只看是否重叠）
      const area = f.t === 'shop' || f.t === 'cbd' || f.t === 'venue' || f.r >= 1.5, near = area ? Math.max(1, Math.min(f.r, 2)) : 0.7;
      let taken = false;
      for (let k = 0; k < lms.length && !taken; k++) if (city.landmarkOn[k] && U.dist(lms[k].x, lms[k].y, f.x, f.y) < near) taken = true;
      // 同一风景区的同名地标已代表设施，不再生成第二座示意建筑。
      if (inScenic) for (let k = 0; k < lms.length && !taken; k++) if (city.landmarkOn[k] && (lms[k].name.indexOf(f.name) >= 0 || f.name.indexOf(lms[k].name) >= 0) && city.region[city.cellAt(lms[k].x, lms[k].y)] === city.region[c0]) taken = true;
      if (taken) continue;
      const sp = this.facModelSpec(f), big = Math.max(sp.w, sp.d) > 260;
      // 风景区本身就是公园；其中的博物馆、动物园等建筑保留真实位置。
      if (inScenic && sp.kind === 'garden' && !sp.style) continue;
      // 选址：一般设施寻找邻近空地，大场地与景区内设施保持原位。
      let x = f.x, y = f.y;
      if (!big && !inScenic) {
        // 片区生成的商业、医院与公园同在片区中心：已被其他设施模型占用的格跳过，范围内没有空位时向外放宽
        let best = Infinity;
        for (const R of [Math.max(0.7, Math.min(f.r, 1.5)), 2.2]) {
          for (let j = Math.floor(f.y - R); j <= Math.floor(f.y + R); j++) for (let i = Math.floor(f.x - R); i <= Math.floor(f.x + R); i++) {
            if (i < 0 || j < 0 || i >= W || j >= city.H) continue;
            const c = j * W + i, L = city.lu[c], d = U.dist(i + 0.5, j + 0.5, f.x, f.y);
            if (d > R + 0.3 || used.has(c) || city.landFrac[c] < 0.7 || city.protectedId[c] || L === LU.WATER || L === LU.AIRPORT || L === LU.HILL) continue;
            let roads = 0; for (let v = 0; v < BS; v++) { const row = (j * BS + v) * BW + i * BS; for (let u = 0; u < BS; u++) if (bm[row + u] >= 2) roads++; }
            const sc = roads / (BS * BS) * 3 + d;
            if (sc < best) { best = sc; x = i + 0.5; y = j + 0.5; }
          }
          if (best < Infinity) break;
        }
        if (best === Infinity && used.has(city.cellAt(x, y))) continue;
      }
      for (const c of foot(x, y, sp.w, sp.d)) used.add(c);
      const prev = old && old.get(f.id);
      if (prev && prev.x === x && prev.y === y && prev.lm.kind === sp.kind) { out.push(prev); continue; }
      out.push({ id: 'f' + f.id, fac: f.id, x: x, y: y, lm: { id: 'fac_' + f.id, kind: sp.kind, style: sp.style, x: x, y: y, w: sp.w, d: sp.d, h: sp.h, rot: 0, name: f.name, fac: true } });
    }
    return out;
  };
  // 设施模型按月、道路版本与开放片区更新；覆盖格的普通楼宇随之清除 / 恢复（标为过期后 2D 地面与三维分块一起重绘）
  Renderer.prototype.syncFacModels = function () {
    const g = this.game, city = g.city;
    if (!city || !city.region) return null;
    const yr = g.year ? g.year() : g.clock.y + ((g.clock.m || 1) - 1) / 12;
    let open = 0; for (let k = 0; k < city.regions.length; k++) if (city.regionOpen[k]) open++;
    const key = Math.floor(yr * 12) + ':' + city.roadVersion + ':' + city.terrainVer + ':' + open + ':' + g.mapId;
    const st = this._facm;
    if (st && st.key === key && st.city === city) return st;
    const list = this.facModels(city, yr), byId = new Map(), cells = new Set();
    const hubs = this.hubModels(city, yr), airs = hubs.filter(function (h) { return h.lm.kind === 'airport'; }), airKey = airs.map(function (h) { return h.id + '@' + h.x.toFixed(2) + ',' + h.y.toFixed(2); }).join('|');
    if (st && st.city === city && st.airKey !== airKey) for (const h of airs.concat(st.airs)) { const s = Math.max(h.lm.w, h.lm.d); for (const c of this._facFoot(h.x, h.y, s, s)) city.dirty.add(c); }   // 机场平面画在地面块里
    for (const it of list) {
      byId.set(it.fac, it);
      for (const c of this._facFoot(it.x, it.y, it.lm.w, it.lm.d)) cells.add(c);
    }
    const same = st && st.city === city && st.list.length === list.length && list.every(function (it, k) { return st.list[k] === it; });
    if (!same) {
      const was = st && st.city === city ? st.cells : new Set();
      was.forEach(function (c) { if (!cells.has(c)) city.dirty.add(c); });
      cells.forEach(function (c) { if (!was.has(c)) city.dirty.add(c); });
      // 设施平面画在地面块里：位置变化处的地面块随覆盖格一起过期
      for (const it of list) if (!(st && st.byId.get(it.fac) === it)) { const c = city.cellAt(it.x, it.y); if (c >= 0) city.dirty.add(c); }
      if (st && st.city === city) for (const it of st.list) if (byId.get(it.fac) !== it) { const c = city.cellAt(it.x, it.y); if (c >= 0) city.dirty.add(c); }
    }
    // 不种树的格：运营中的跑道两侧约 220 m 与机场模型的停机坪范围
    const noTree = new Set(), CMM = CFG.CELL_M, rwy = this.runwaySeg(city);
    // 其他机场（D.runways）：启用后的跑道两侧，以及交通枢纽区域（机场岛）全部不种树；跑道启用时所在地面块重画
    const runs = (D.runways || []).filter(function (r) { return yr >= r.from; }), runKey = runs.length;
    const segCells = function (r, rad, fn) { const x0 = Math.floor(Math.min(r.a[0], r.b[0]) - rad), x1 = Math.ceil(Math.max(r.a[0], r.b[0]) + rad), y0 = Math.floor(Math.min(r.a[1], r.b[1]) - rad), y1 = Math.ceil(Math.max(r.a[1], r.b[1]) + rad); for (let j = Math.max(0, y0); j < Math.min(city.H, y1); j++) for (let i = Math.max(0, x0); i < Math.min(city.W, x1); i++) if (U.distToSeg(i + 0.5, j + 0.5, r.a[0], r.a[1], r.b[0], r.b[1]) < rad) fn(j * city.W + i); };
    for (const r of runs) segCells(r, 0.9, function (c) { noTree.add(c); });
    if (st && st.city === city && st.runKey !== runKey) for (const r of D.runways || []) segCells(r, 0.7, function (c) { city.dirty.add(c); });
    if (!this._hubCells || this._hubCells.city !== city) { const hc = []; for (let c = 0; c < city.N; c++) if (city.regions[city.region[c]].hub) hc.push(c); this._hubCells = { city: city, cells: hc }; }
    for (const c of this._hubCells.cells) noTree.add(c);
    if (airs.length && rwy) {
      const x0 = Math.floor(Math.min(rwy[0][0], rwy[1][0]) - 1), x1 = Math.ceil(Math.max(rwy[0][0], rwy[1][0]) + 1), y0 = Math.floor(Math.min(rwy[0][1], rwy[1][1]) - 1), y1 = Math.ceil(Math.max(rwy[0][1], rwy[1][1]) + 1);
      for (let j = Math.max(0, y0); j < Math.min(city.H, y1); j++) for (let i = Math.max(0, x0); i < Math.min(city.W, x1); i++) if (U.distToSeg(i + 0.5, j + 0.5, rwy[0][0], rwy[0][1], rwy[1][0], rwy[1][1]) < 0.9) noTree.add(j * city.W + i);
    }
    for (const h of airs) {
      const a = (h.lm.rot || 0) * Math.PI / 180, ca = Math.cos(a), sa = Math.sin(a), hw = h.lm.w / 2 / CMM + 0.3, hd = (h.lm.d / 2 + (h.lm.rwOff || 0)) / CMM + 0.3, R = Math.hypot(hw, hd);
      for (let j = Math.floor(h.y - R); j <= Math.floor(h.y + R); j++) for (let i = Math.floor(h.x - R); i <= Math.floor(h.x + R); i++) {
        if (i < 0 || j < 0 || i >= city.W || j >= city.H) continue;
        const dx = i + 0.5 - h.x, dy = j + 0.5 - h.y, u = dx * ca + dy * sa, v = -dx * sa + dy * ca;
        if (Math.abs(u) <= hw && v >= -h.lm.d / 2 / CMM - 0.3 && v <= hd) noTree.add(j * city.W + i);
      }
    }
    this._facm = { key: key, city: city, list: list, hubs: hubs, byId: byId, cells: cells, airs: airs, airKey: airKey, noTree: noTree, runKey: runKey, ver: same && st ? st.ver : ((st && st.ver) || 0) + 1 };
    return this._facm;
  };

  const R = Renderer.prototype;
  R.extraModels = function () {
    const f = this._facm || this.syncFacModels();
    return f ? f.list.concat(f.hubs) : [];
  };
  const centre = R.isLmCenter;
  R.isLmCenter = function (c) { return centre.call(this, c) || !!(this._facm && this._facm.cells.has(c)); };
  const trees = R.isoTrees;
  R.isoTrees = function (ctx, pj, c) {
    if (this._facm && this._facm.noTree.has(c)) return 0;
    return trees.apply(this, arguments);
  };
  const setGame = R.setGame;
  R.setGame = function (g) {
    this._facm = this._hubCells = this._shade = null;
    this.clearFacilitySprites();
    return setGame.call(this, g);
  };
  R.clearFacilitySprites = function () {
    if (this._facilitySprites) for (const e of this._facilitySprites.values()) e.cv.width = e.cv.height = 1;
    this._facilitySprites = new Map(); this._facilityPx = 0;
  };
  R.drawFacilitySprite = function (ctx, lm, lvl, alpha) {
    const a = this.P(lm.x, lm.y, 0), radius = Math.hypot(lm.w, lm.d) / CFG.CELL_M * this.z;
    if (a.x + radius < 0 || a.x - radius > this.w || a.y + radius < 0 || a.y - radius > this.h + Math.max(100, lm.h * this.z * .012)) return;
    const store = this._facilitySprites || (this._facilitySprites = new Map());
    const key = [lm.id, lvl, this.themeName, this._facm.ver, lm.x, lm.y, CM.Settings.get('lighting')].join(':');
    let e = store.get(key);
    if (!e) {
      const r = Math.hypot(lm.w, lm.d) / CFG.CELL_M / 2 + .2, h = Math.max(20, lm.h || 30) * .016 * lvl;
      const w = Math.ceil(2 * r * 1.4143 * lvl + 12), ht = Math.ceil(r * 1.4143 * lvl + h + 12);
      if (w * ht > 2e6) return;
      const cv = document.createElement('canvas'); cv.width = w; cv.height = ht;
      const x = cv.getContext('2d'), ox = w / 2, oy = ht - h / 4 - r * .7072 * lvl - 6;
      const pj = (wx, wy, z) => [ox + ((wx - lm.x) - (wy - lm.y)) * .70710678 * lvl, oy + ((wx - lm.x) + (wy - lm.y)) * .35355339 * lvl - z * .82 * lvl];
      this.isoLandmark(x, pj, lm, lvl);
      e = { cv, ax: ox, ay: oy, px: w * ht }; store.set(key, e); this._facilityPx = (this._facilityPx || 0) + e.px;
      // Supplemental sprites have a separate, small browser budget (8 MiB RGBA).
      while (this._facilityPx > 2e6 && store.size > 1) {
        const k = store.keys().next().value, old = store.get(k);
        this._facilityPx -= old.px; old.cv.width = old.cv.height = 1; store.delete(k);
      }
    } else { store.delete(key); store.set(key, e); }
    const scale = this.z / lvl; ctx.globalAlpha = alpha;
    ctx.drawImage(e.cv, a.x - e.ax * scale, a.y - e.ay * scale, e.cv.width * scale, e.cv.height * scale);
  };
  R.drawTerrainLight = function (ctx) {
    const c = this.game.city, key = [c.uid, c.terrainVer, this.themeName].join(':'); let shade = this._shade;
    if (!shade || shade.key !== key) {
      const cv = document.createElement('canvas'); cv.width = c.W; cv.height = c.H;
      const x = cv.getContext('2d'), img = x.createImageData(c.W, c.H), a = img.data;
      const level = (i, j) => { const n = U.clamp(j, 0, c.H - 1) * c.W + U.clamp(i, 0, c.W - 1); return c.lu[n] === LU.HILL ? 1 + (c.wood[n] || 0) : 0; };
      for (let j = 0; j < c.H; j++) for (let i = 0; i < c.W; i++) {
        const k = j * c.W + i; if (c.lu[k] !== LU.HILL) continue;
        const light = (level(i + 1, j) + level(i, j + 1) - level(i - 1, j) - level(i, j - 1)) * .16, o = k * 4;
        a[o] = a[o + 1] = a[o + 2] = light > 0 ? 255 : 0; a[o + 3] = Math.min(42, Math.round(Math.abs(light) * 52));
      }
      x.putImageData(img, 0, 0); shade = this._shade = { key, cv };
    }
    ctx.save(); ctx.imageSmoothingEnabled = true; ctx.drawImage(shade.cv, 0, 0, c.W, c.H); ctx.restore();
  };
  R.signatureOf = function (st, mh, c, k) {
    const map = this.game.mapId, r = U.hash2(c, k, 97);
    if (map === 'gz' || map === 'tp') return st !== 'glass' && mh >= 9 && mh <= 30 && r < (st === 'old' || st === 'masonry' ? (map === 'gz' ? .3 : .12) : .05) ? 'qilou' : null;
    if (map === 'hk') return (st === 'slab' || st === 'tile') && mh >= 50 && r < .25 ? 'cross' : null;
    if (map === 'tk') return ['slab', 'tile', 'masonry'].includes(st) && mh >= 18 && mh <= 70 && r < .25 ? 'setback' : null;
    if (map === 'pa') return st === 'old' && mh >= 15 && r < .1 ? 'rotunda' : null;
    if (map === 'sh') return (st === 'masonry' && mh >= 20 && r < .3) || (st === 'slab' && mh >= 30 && r < .06) ? 'deco' : st !== 'glass' && mh <= 14 && r < (st === 'old' ? .12 : .025) ? 'rows' : null;
    if (map === 'wh') return st !== 'glass' && mh <= 16 && r < (st === 'old' ? .2 : .035) ? 'rows' : null;
    if (map === 'hz') return st !== 'glass' && mh <= 18 && r < (st === 'old' ? .2 : .035) ? 'jiangnan' : null;
    return null;
  };
  R.drawSignature = function (ctx, pj, i, j, b, kind, s) {
    const x0 = i + b[0], y0 = j + b[1], x1 = i + b[2], y1 = j + b[3], w = x1 - x0, d = y1 - y0, h = b[4] * 2 / CFG.CELL_M;
    const night = this.th.night, lit = CM.Settings.get('lighting') !== false;
    const wall = night ? '#48586d' : kind === 'rows' ? '#c4aaa5' : '#d3dfeb', roof = night ? '#344653' : kind === 'jiangnan' ? '#6b7985' : '#a0b6c9';
    const fill = (pts, col) => { ctx.fillStyle = col; ctx.beginPath(); pts.forEach((v, k) => k ? ctx.lineTo(...v) : ctx.moveTo(...v)); ctx.closePath(); ctx.fill(); };
    const box = (a, b, c, d, z0, z1) => {
      const A = pj(a, b, z1), B = pj(c, b, z1), C = pj(c, d, z1), E = pj(a, d, z1);
      fill([E, C, pj(c, d, z0), pj(a, d, z0)], wall); fill([B, C, pj(c, d, z0), pj(c, b, z0)], lit ? (night ? '#39495c' : '#b7cadc') : wall); fill([A, B, C, E], roof);
    };
    if (lit) { const z = Math.min(.7, h * .4); fill([pj(x0, y1, 0), pj(x1, y1, 0), pj(x1 + z, y1 + z, 0), pj(x0 + z, y1 + z, 0)], night ? 'rgba(0,0,0,.2)' : 'rgba(75,105,140,.1)'); }
    if (kind === 'cross') { box(x0 + w * .3, y0, x1 - w * .3, y1, 0, h); box(x0, y0 + d * .3, x1, y1 - d * .3, 0, h); }
    else if (kind === 'setback' || kind === 'deco') for (let k = 0; k < 3; k++) box(x0 + w * k * .1, y0 + d * k * .1, x1 - w * k * .1, y1 - d * k * .1, h * k / 3, h * (k + 1) / 3);
    else if (kind === 'qilou') {
      box(x0, y0, x1, y1 - d * .18, h * .2, h);
      for (let k = 0; k < 4; k++) { const x = x0 + w * (k + .08) / 4; box(x, y1 - d * .21, x + w * .09, y1 - d * .13, 0, h * .2); }
    } else if (kind === 'rotunda') {
      box(x0, y0, x1, y1, 0, h); const cx = x1 - w * .18, cy = y1 - d * .18, r = Math.min(w, d) * .24;
      for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4, b = (k + 1) * Math.PI / 4; fill([pj(cx + Math.cos(a) * r, cy + Math.sin(a) * r, 0), pj(cx + Math.cos(b) * r, cy + Math.sin(b) * r, 0), pj(cx + Math.cos(b) * r, cy + Math.sin(b) * r, h * 1.12), pj(cx + Math.cos(a) * r, cy + Math.sin(a) * r, h * 1.12)], wall); }
      fill(Array.from({ length: 8 }, (_, k) => pj(cx + Math.cos(k * Math.PI / 4) * r, cy + Math.sin(k * Math.PI / 4) * r, h * 1.12)), roof);
    } else {
      const count = kind === 'rows' ? 3 : 1;
      for (let k = 0; k < count; k++) {
        const a = x0 + w * k / count, c = x0 + w * (k + .93) / count; box(a, y0, c, y1, 0, h);
        const ridge0 = pj(a, (y0 + y1) / 2, h * 1.17), ridge1 = pj(c, (y0 + y1) / 2, h * 1.17);
        fill([pj(a, y1, h), pj(c, y1, h), ridge1, ridge0], roof);
        if (kind === 'jiangnan') { box(a, y0, a + w * .05, y1, h * .8, h * 1.12); box(c - w * .05, y0, c, y1, h * .8, h * 1.12); }
      }
    }
    if (s >= 32) {
      ctx.strokeStyle = night ? 'rgba(255,216,156,.6)' : 'rgba(85,116,150,.35)'; ctx.lineWidth = Math.max(.6, s / 60); ctx.beginPath();
      for (let z = h * .3; z < h; z += h / 4) { const a = pj(x0 + w * .12, y1 + .003, z), b = pj(x1 - w * .12, y1 + .003, z); ctx.moveTo(...a); ctx.lineTo(...b); } ctx.stroke();
    }
  };
})(window.CM);
