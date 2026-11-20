'use strict';
// 背景交通的画面（v2.2）：普通铁路上的列车与水面上的渡轮，只用于画面，不参与客流、道路或运营计算。
// 列车数量随本图背景交通的比重（DATA.bg，经 CM.Eras.bg 按年份取值）变化：东京的国铁与私铁、巴黎的郊区铁路、香港的九广铁路最多，
// 其他地图只有少量列车；渡轮按 DATA.bgViz.ferries 的航线与年份出现，数量同样随比重变化。有轨电车由道路车辆的一部分换成（agents.js）。
// 每帧只推进几十个对象，铁路与航线在年份变化时才重建。
(function (CM) {
  const U = CM.U;
  const BG = { trains: [], boats: [], key: '', routes: [], ferries: [] };
  CM.BgTransit = BG;
  const REGION_KEY = { '中国内地': 'cn', '中国香港': 'hk', '中国台湾': 'tw', '日本': 'jp', '法国': 'eu', '英国': 'eu', '新加坡': 'hk', '美国': 'eu', '澳大利亚': 'eu' };
  const TRAIN_COL = { jp: ['#3a9a4a', '#f08a24', '#2a8fd0', '#c9c3b6'], eu: ['#2f4f3f', '#6b2f2a', '#3a4a6a'], hk: ['#7a2e2a', '#2f5a8a'], cn: ['#2f6b3a', '#3a5a8a'], tw: ['#e9eef2', '#2f5a8a'] };
  const CAR_L = 0.09, CAR_GAP = 0.012;   // 车厢长度与间隙（格）
  const pick = function (a) { return a[Math.floor(Math.random() * a.length)]; };
  const rkey = function () { const m = CM.curMap ? CM.curMap() : null; return (m && REGION_KEY[m.region]) || 'cn'; };

  // 铁路：地面上较长的路段（隧道不画；高速铁路与新线按开通年份）；玩家接管的区段（v3.1）从路段里剔除，背景列车不再在上面跑
  function railRoutes(year, taken) {
    const out = [];
    for (const r of (CM.Geo && CM.Geo.rail) || []) {
      if ((r.flags & 2) || !CM.City.railActiveAt(r, year)) continue;
      const p = r.p; let pts = [];
      const flush = function () {
        if (pts.length >= 2) { const cum = U.cumLen(pts), total = cum[cum.length - 1]; if (total >= 2) out.push({ pts: pts, cum: cum, total: total, hsr: !!(r.flags & 16), key: pts[0][0].toFixed(2) + ',' + pts[0][1].toFixed(2) + ':' + total.toFixed(1) }); }
        pts = [];
      };
      // 被接管的部分：有接管时折线按约 1/4 格加密，逐点看是否落在已接管线位旁且走向平行
      const n = p.length / 2;
      for (let i = 0; i < n; i++) {
        const x = p[2 * i], y = p[2 * i + 1];
        if (!taken) { pts.push([x, y]); continue; }
        if (i + 1 >= n) { const dx = x - p[2 * i - 2], dy = y - p[2 * i - 1]; if (taken.has(x, y, dx, dy)) flush(); else pts.push([x, y]); continue; }
        const dx = p[2 * i + 2] - x, dy = p[2 * i + 3] - y, m = Math.max(1, Math.ceil(Math.hypot(dx, dy) * 4));
        for (let k = 0; k < m; k++) { const px = x + dx * k / m, py = y + dy * k / m; if (taken.has(px, py, dx, dy)) flush(); else pts.push([px, py]); }
      }
      flush();
    }
    out.sort(function (a, b) { return b.total - a.total; });
    return out.slice(0, 40);
  }
  // 渡轮航线：按格加密后贴到最近的水面（填海前后自动适应），再略作平滑
  function ferryRoute(f, city) {
    const LU = CM.LU, W = city.W, H = city.H, raw = f.pts, pts = [];
    const water = function (x, y) { const cx = Math.floor(x), cy = Math.floor(y); return cx >= 0 && cy >= 0 && cx < W && cy < H && city.lu[cy * W + cx] === LU.WATER; };
    for (let i = 0; i + 1 < raw.length; i++) {
      const a = raw[i], b = raw[i + 1], n = Math.max(1, Math.ceil(U.dist(a[0], a[1], b[0], b[1]) / 0.5));
      for (let k = 0; k < n; k++) pts.push([a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n]);
    }
    pts.push(raw[raw.length - 1].slice());
    // 河道航线（f.river，如塞纳河）：河面常窄于一格，直接贴到河道中心线上
    const segs = [];
    if (f.river) for (const wl of (CM.Geo && CM.Geo.waterLines) || []) if (wl.name === f.river) for (let i = 0; i + 3 < wl.p.length; i += 2) segs.push([wl.p[i], wl.p[i + 1], wl.p[i + 2], wl.p[i + 3]]);
    if (segs.length) {
      for (const p of pts) {
        let bd = 9, bx = 0, by = 0;
        for (const s of segs) {
          const dx = s[2] - s[0], dy = s[3] - s[1], L = dx * dx + dy * dy || 1e-9, t = U.clamp(((p[0] - s[0]) * dx + (p[1] - s[1]) * dy) / L, 0, 1);
          const x = s[0] + t * dx, y = s[1] + t * dy, d = (x - p[0]) * (x - p[0]) + (y - p[1]) * (y - p[1]);
          if (d < bd) { bd = d; bx = x; by = y; }
        }
        if (bd < 9) { p[0] = bx; p[1] = by; }
      }
      const cum = U.cumLen(pts);
      return { pts: pts, cum: cum, total: cum[cum.length - 1] };
    }
    for (const p of pts) {
      if (water(p[0], p[1])) continue;
      let best = null, bd = 12;
      for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
        const x = Math.floor(p[0]) + dx + 0.5, y = Math.floor(p[1]) + dy + 0.5;
        if (!water(x, y)) continue;
        const d = (x - p[0]) * (x - p[0]) + (y - p[1]) * (y - p[1]);
        if (d < bd) { bd = d; best = [x, y]; }
      }
      if (best) { p[0] = best[0]; p[1] = best[1]; }
    }
    for (let it = 0; it < 3; it++) for (let i = 1; i + 1 < pts.length; i++) {
      const a = pts[i - 1], b = pts[i], c = pts[i + 1], nx = (a[0] + 2 * b[0] + c[0]) / 4, ny = (a[1] + 2 * b[1] + c[1]) / 4;
      if (water(nx, ny)) { b[0] = nx; b[1] = ny; }
    }
    for (const atEnd of [false, true]) {
      const source = atEnd ? raw.at(-1) : raw[0], dock = CM.BgNet.shore(city, source[0], source[1]).dock;
      const p = atEnd ? pts.at(-1) : pts[0];
      if (!city.waterAt(...dock)) continue;
      if (U.dist(p[0], p[1], dock[0], dock[1]) < 0.02) pts[atEnd ? pts.length - 1 : 0] = dock;
      else if (atEnd) pts.push(dock); else pts.unshift(dock);
    }
    const cum = U.cumLen(pts);
    return { pts: pts, cum: cum, total: cum[cum.length - 1] };
  }
  const newTrain = function (routes, rk) {
    const ri = Math.floor(Math.random() * routes.length), r = routes[ri], dir = Math.random() < 0.5 ? 1 : -1;
    const hsr = r.hsr && CM.game && CM.game.clock.y >= (CM.DATA.hsrYear || 2009);
    return { r: ri, s: dir > 0 ? Math.random() * r.total * 0.6 : r.total * (0.4 + Math.random() * 0.6), dir: dir, v: (hsr ? 150 : 55 + Math.random() * 25) / 3.6 / CM.CFG.CELL_M,
      cars: hsr ? 8 : 4 + Math.floor(Math.random() * 6), color: hsr ? '#eef2f5' : pick(TRAIN_COL[rk] || TRAIN_COL.cn), alpha: 0, out: false };
  };
  // 年份或地图变化时调整列车与渡轮的数量
  BG.sync = function (g) {
    const D = CM.DATA, y = g.clock.y, taken = CM.Takeover && CM.Takeover.takenRail ? CM.Takeover.takenRail(g.net) : null;
    const key = (CM.mapId || '') + ':' + y + ':' + (taken ? taken.sig : '');
    const tNow = g.year(), ferryKey = Math.round(tNow * 12) + ':' + g.city.terrainVer;
    if (BG.city !== g.city) { BG.trains = []; BG.boats = []; BG.ferryKey = null; BG.key = ''; BG.city = g.city; }
    if (key === BG.key && ferryKey === BG.ferryKey) return;
    const rk = rkey(), bg = CM.Eras && CM.Eras.bg ? CM.Eras.bg(tNow) : null;
    const share = bg ? (bg.road != null ? 0.15 : bg.share) : 0, BN = CM.BgNet && CM.BgNet.lines();
    if (key !== BG.key) {
      BG.key = key;
      // 线路重排后（跨年、接管区段变化），列车留在原来的路段上；路段被接管剔除的列车消失，由新的列车补上
      const oldRoutes = BG.routes;
      BG.routes = railRoutes(y, taken);
      const idx = new Map(BG.routes.map(function (r, i) { return [r.key, i]; }));
      BG.trains = BG.trains.filter(function (t) { const o = oldRoutes[t.r], i = o ? idx.get(o.key) : undefined; if (i == null) return false; t.r = i; return true; });
      // 有背景交通线路的地图（v2.9）：列车数随运营中的铁路线路数，渡轮按线路走向
      const nRail = BN ? BN.filter(function (L) { return L.kind === 'rail' && CM.BgNet.active(L, tNow); }).length : 0;
      const nT = BG.routes.length ? Math.min(BG.routes.length * 2, BN ? Math.min(40, 4 + nRail * 3) : Math.round(3 + 30 * share)) : 0;
      while (BG.trains.length < nT) BG.trains.push(newTrain(BG.routes, rk));
      for (let i = nT; i < BG.trains.length; i++) BG.trains[i].out = true;   // 多出的列车驶到线路尽头后不再出现
    }
    if (ferryKey === BG.ferryKey) return;
    BG.ferryKey = ferryKey;
    // 渡轮：航线按年份出现；船数随背景交通比重相对开局时的变化增减（至少一艘）
    let fv = ((D.bgViz && D.bgViz.ferries) || []).filter(function (f) { return f.piers && (f.from == null || y >= f.from) && (f.to == null || y <= f.to); });   // 只有标注了码头的航线（v2.9）
    if (BN && !(D.bgViz && D.bgViz.ferries)) fv = BN.filter(function (L) { return L.kind === 'ferry' && CM.BgNet.active(L, tNow); }).map(function (L) {
      const H = CM.BgNet.hubs(), G = H.lineGeo[BN.indexOf(L)];
      return { name: L.name, n: Math.max(1, Math.round(60 / (L.head || 30))), color: '#f4f1e8', pts: G.pts.map(function (p) { return [p[0], p[1]]; }) };
    });
    const s0 = D.bg ? U.interp(D.bg.share, CM.CFG.START.y) : 0, ratio = BN ? 1 : (s0 > 0 ? U.clamp(share / s0, 0.2, 1.2) : 1);
    const previous = BG.ferries;
    BG.ferries = fv.map(f => ({ f, r: ferryRoute(f, g.city) })).filter(fr => fr.r.total > 0.05);
    const boats = [];
    BG.ferries.forEach(function (fr, i) {
      const n = Math.max(1, Math.round((fr.f.n || 2) * ratio));
      for (let k = 0; k < n; k++) {
        const old = BG.boats.find(b => b.k === k && b.name === fr.f.name);
        const oldLength = old ? previous[old.ri].r.total : 0;
        boats.push(old ? { ...old, ri: i, s: U.clamp(old.s / oldLength, 0, 1) * fr.r.total } : { ri: i, k: k, name: fr.f.name, s: fr.r.total * (k + 0.5) / n, dir: k % 2 ? -1 : 1, wait: 0, v: 18 / 3.6 / CM.CFG.CELL_M, color: fr.f.color || '#f4f1e8', alpha: 0 });
      }
    });
    BG.boats = boats;
  };
  BG.update = function (dt, g) {
    if (!g || !g.city || !CM.Geo) return;
    BG.sync(g);
    const dtv = dt * g.visualRate() * CM.CFG.time.visualPerSec, rk = rkey();
    for (let i = BG.trains.length - 1; i >= 0; i--) {
      const t = BG.trains[i], r = BG.routes[t.r];
      if (!r) { BG.trains.splice(i, 1); continue; }
      t.s += t.dir * t.v * dtv;
      const len = t.cars * (CAR_L + CAR_GAP), atEnd = t.dir > 0 ? t.s - len > r.total : t.s + len < 0;
      t.alpha = U.clamp(t.alpha + (atEnd ? -1 : 1) * (dtv > 0 ? dt : 0) * 1.5, 0, 1);
      if (atEnd && t.alpha <= 0) { if (t.out) BG.trains.splice(i, 1); else BG.trains[i] = newTrain(BG.routes, rk); }
    }
    advanceBoats(dt, dtv, CM.R?.z || CM.R?.cam?.zoom || 30);
  };
  const BOAT_MAX = 3, BOAT_WIDTH = 9, BOAT_LENGTH = 30;
  function boatScale(zoom) {
    return U.clamp(7 / (BOAT_WIDTH / CM.CFG.CELL_M * zoom), 1, BOAT_MAX);
  }
  function boatAt(fr, boat, scale, out) {
    const r = fr.r, a = {}, b = {};
    U.posAt(r.pts, r.cum, boat.s, out);
    U.posAt(r.pts, r.cum, Math.max(0, boat.s - 0.06), a);
    U.posAt(r.pts, r.cum, Math.min(r.total, boat.s + 0.06), b);
    const x = b.x - a.x, y = b.y - a.y, length = Math.hypot(x, y) || 1;
    out.dx = boat.dir * x / length; out.dy = boat.dir * y / length;
    const lane = BOAT_WIDTH * scale * 0.7 / CM.CFG.CELL_M;
    const offset = lane * U.clamp(Math.min(boat.s, r.total - boat.s) / 0.25, 0, 1);
    const px = out.x - out.dy * offset, py = out.y + out.dx * offset;
    if (BG.city.waterAt(px, py) || !BG.city.waterAt(out.x, out.y)) { out.x = px; out.y = py; }
    return out;
  }

  function advanceBoats(dt, dtv, zoom) {
    if (dtv <= 0 || !BG.boats.length) return;
    const boats = BG.boats, scale = boatScale(zoom), safe = 34 * scale / CM.CFG.CELL_M;
    const states = boats.map(function (b) {
      const fr = BG.ferries[b.ri], p = boatAt(fr, b, scale, {});
      const left = b.dir > 0 ? fr.r.total - b.s : b.s;
      const berth = b.wait > 0 ? (b.s <= fr.r.total / 2 ? fr.r.pts[0] : fr.r.pts.at(-1))
        : left < 0.9 ? (b.dir > 0 ? fr.r.pts.at(-1) : fr.r.pts[0]) : null;
      return { p, left, berth };
    });
    const hold = new Uint8Array(boats.length);
    for (let i = 0; i < boats.length; i++) for (let j = i + 1; j < boats.length; j++) {
      const a = states[i], b = states[j], A = boats[i], B = boats[j];
      const aw = A.wait > 0, bw = B.wait > 0;
      if (a.berth && b.berth && U.dist(a.berth[0], a.berth[1], b.berth[0], b.berth[1]) < 0.45) {
        if (!aw && (bw || a.left > b.left)) hold[i] = 1;
        else if (!bw) hold[j] = 1;
        continue;
      }
      if (A.ri === B.ri && A.dir !== B.dir && !aw && !bw) continue;
      const dx = b.p.x - a.p.x, dy = b.p.y - a.p.y;
      if (Math.hypot(dx, dy) > safe + dtv * Math.max(A.v, B.v)) continue;
      const aToward = a.p.dx * dx + a.p.dy * dy > 0;
      const bToward = b.p.dx * dx + b.p.dy * dy < 0;
      if (aw || bw) {
        if (aw && !bw && bToward) hold[j] = 1;
        if (bw && !aw && aToward) hold[i] = 1;
      } else if (aToward && !bToward) hold[i] = 1;
      else if (bToward) hold[j] = 1;
    }
    // 相交航线全部互相让行时，给其中一艘优先权，避免永久等待。
    if (hold.every(Boolean) && boats.every(b => b.wait <= 0)) hold[0] = 0;
    boats.forEach(function (b, i) {
      const total = BG.ferries[b.ri].r.total;
      b.alpha = Math.min(1, b.alpha + dt);
      if (b.wait > 0) { b.wait -= dtv; return; }
      if (hold[i]) return;
      b.s += b.dir * b.v * dtv;
      if (b.s >= total || b.s <= 0) {
        b.s = U.clamp(b.s, 0, total); b.dir = -b.dir; b.wait = 90;
      }
    });
  }
  // 列车第 k 节车厢的中心与前后端
  const carAt = function (r, t, k, q, a, b) {
    const sc = t.s - t.dir * (k * (CAR_L + CAR_GAP) + CAR_L / 2);
    if (sc < 0 || sc > r.total) return false;
    U.posAt(r.pts, r.cum, sc, q);
    U.posAt(r.pts, r.cum, U.clamp(sc - CAR_L / 2, 0, r.total), a); U.posAt(r.pts, r.cum, U.clamp(sc + CAR_L / 2, 0, r.total), b);
    q.ang = Math.atan2(b.y - a.y, b.x - a.x);
    return true;
  };
  // 2D：车厢为圆头粗线，渡轮为白色船身与淡淡的尾迹
  BG.draw2D = function (ctx, R, alpha) {
    if ((!BG.trains.length && !BG.boats.length)) return;
    const q = {}, a = {}, b = {}, pa = {}, pb = {}, w = U.clamp(R.z * 0.05, 2, 6.5);
    ctx.save(); ctx.lineCap = 'butt';   // 车厢方头，渡轮圆头
    for (const t of BG.trains) {
      const r = BG.routes[t.r]; if (!r || t.alpha <= 0.01) continue;
      ctx.globalAlpha = t.alpha * alpha;
      for (let k = 0; k < t.cars; k++) {
        if (!carAt(r, t, k, q, a, b)) continue;
        R.P(a.x, a.y, 0, pa); R.P(b.x, b.y, 0, pb);
        if (Math.max(pa.x, pb.x) < -10 || Math.min(pa.x, pb.x) > R.w + 10 || Math.max(pa.y, pb.y) < -10 || Math.min(pa.y, pb.y) > R.h + 10) continue;
        ctx.strokeStyle = 'rgba(30,36,44,0.55)'; ctx.lineWidth = w + 1.6; ctx.beginPath(); ctx.moveTo(pa.x, pa.y); ctx.lineTo(pb.x, pb.y); ctx.stroke();
        ctx.strokeStyle = t.color; ctx.lineWidth = w; ctx.stroke();
      }
    }
    ctx.lineCap = 'round';
    const scale = boatScale(R.z), half = BOAT_LENGTH * scale / (2 * CM.CFG.CELL_M);
    const boatWidth = Math.max(0.75, BOAT_WIDTH * scale / CM.CFG.CELL_M * R.z);
    for (const bt of BG.boats) {
      const fr = BG.ferries[bt.ri]; if (!fr || bt.alpha <= 0.01) continue;
      boatAt(fr, bt, scale, q);
      R.P(q.x - q.dx * half, q.y - q.dy * half, 0, pa);
      R.P(q.x + q.dx * half, q.y + q.dy * half, 0, pb);
      if (Math.max(pa.x, pb.x) < -20 || Math.min(pa.x, pb.x) > R.w + 20 || Math.max(pa.y, pb.y) < -20 || Math.min(pa.y, pb.y) > R.h + 20) continue;
      ctx.globalAlpha = bt.alpha * alpha;
      if (bt.wait <= 0) {   // 尾迹
        const pt = R.P(q.x - q.dx * half * 2.1, q.y - q.dy * half * 2.1, 0, {});
        ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = boatWidth * 0.45;
        ctx.beginPath(); ctx.moveTo(pt.x, pt.y); ctx.lineTo(pa.x, pa.y); ctx.stroke();
      }
      ctx.strokeStyle = 'rgba(30,36,44,0.6)'; ctx.lineWidth = boatWidth + 1; ctx.beginPath(); ctx.moveTo(pa.x, pa.y); ctx.lineTo(pb.x, pb.y); ctx.stroke();
      ctx.strokeStyle = bt.color; ctx.lineWidth = boatWidth; ctx.stroke();
      if (boatWidth >= 2) {
        ctx.fillStyle = '#2f6b4f'; ctx.beginPath(); ctx.arc((pa.x + pb.x) / 2, (pa.y + pb.y) / 2, boatWidth * 0.24, 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.restore();
  };
})(window.CM);
