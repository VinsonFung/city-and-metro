'use strict';
// 背景交通的画面（v2.2）：普通铁路上的列车与水面上的渡轮，只用于画面，不参与客流、道路或运营计算。
// 列车数量随本图背景交通的比重（DATA.bg，经 CM.Eras.bg 按年份取值）变化：东京的国铁与私铁、巴黎的郊区铁路、香港的九广铁路最多，
// 其他地图只有少量列车；渡轮按 DATA.bgViz.ferries 的航线与年份出现，数量同样随比重变化。有轨电车由道路车辆的一部分换成（agents.js）。
// 每帧只推进几十个对象，铁路与航线在年份变化时才重建。
(function (CM) {
  const U = CM.U;
  const BG = { trains: [], boats: [], key: '', routes: [], ferries: [] };
  CM.BgTransit = BG;
  const REGION_KEY = { '中国内地': 'cn', '中国香港': 'hk', '中国台湾': 'tw', '日本': 'jp', '法国': 'eu' };
  const TRAIN_COL = { jp: ['#3a9a4a', '#f08a24', '#2a8fd0', '#c9c3b6'], eu: ['#2f4f3f', '#6b2f2a', '#3a4a6a'], hk: ['#7a2e2a', '#2f5a8a'], cn: ['#2f6b3a', '#3a5a8a'], tw: ['#e9eef2', '#2f5a8a'] };
  const CAR_L = 0.09, CAR_GAP = 0.012;   // 车厢长度与间隙（格）
  const pick = function (a) { return a[Math.floor(Math.random() * a.length)]; };
  const rkey = function () { const m = CM.curMap ? CM.curMap() : null; return (m && REGION_KEY[m.region]) || 'cn'; };

  // 铁路：原网页范围中的地面路段（至少500m，保留香港等小图的分段）（隧道不画；高速铁路与新线按开通年份）
  function railRoutes(year) {
    const D = CM.DATA, out = [];
    for (const r of (CM.Geo && CM.Geo.rail) || []) {
      if ((r.flags & 2) || (r.year && year < r.year) || ((r.flags & 16) && year < (D.hsrYear || 2009))) continue;
      const p = r.p, pts = [];
      for (let i = 0; i + 1 < p.length; i += 2) pts.push([p[i], p[i + 1]]);
      if (pts.length < 2) continue;
      const cum = U.cumLen(pts), total = cum[cum.length - 1];
      if (total >= 2) out.push({ pts: pts, cum: cum, total: total, hsr: !!(r.flags & 16) });
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
    const D = CM.DATA, y = g.clock.y, key = (CM.mapId || '') + ':' + y + ':' + g.city.N;
    if (key === BG.key && BG.city === g.city) return;
    if (BG.city !== g.city) { BG.trains = []; BG.boats = []; }
    BG.city = g.city;
    BG.key = key;
    const rk = rkey(), bg = CM.Eras && CM.Eras.bg ? CM.Eras.bg(g.year()) : null, share = bg ? bg.share : 0;
    BG.routes = railRoutes(y);
    const nT = BG.routes.length ? Math.min(BG.routes.length * 2, Math.round(3 + 30 * share)) : 0;
    BG.trains = BG.trains.filter(function (t) { return t.r < BG.routes.length; });
    while (BG.trains.length < nT) BG.trains.push(newTrain(BG.routes, rk));
    for (let i = nT; i < BG.trains.length; i++) BG.trains[i].out = true;   // 多出的列车驶到线路尽头后不再出现
    // 渡轮：航线按年份出现；船数随背景交通比重相对开局时的变化增减（至少一艘）
    const fv = ((D.bgViz && D.bgViz.ferries) || []).filter(function (f) { return (!f.from || y >= f.from) && (!f.to || y <= f.to); });
    const s0 = D.bg ? U.interp(D.bg.share, CM.CFG.START.y) : 0, ratio = s0 > 0 ? U.clamp(share / s0, 0.2, 1.2) : 1;
    BG.ferries = fv.map(function (f) { return { f: f, r: ferryRoute(f, g.city) }; });
    const boats = [];
    BG.ferries.forEach(function (fr, i) {
      const n = Math.max(1, Math.round((fr.f.n || 2) * ratio));
      for (let k = 0; k < n; k++) {
        const old = BG.boats.find(function (b) { return b.ri === i && b.k === k && b.name === fr.f.name; });
        boats.push(old ? Object.assign(old, { s: U.clamp(old.s, 0, fr.r.total) }) : { ri: i, k: k, name: fr.f.name, s: fr.r.total * (k + 0.5) / n, dir: k % 2 ? -1 : 1, wait: 0, v: 18 / 3.6 / CM.CFG.CELL_M, color: fr.f.color || '#f4f1e8', alpha: 0 });
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
    for (const b of BG.boats) {
      const fr = BG.ferries[b.ri]; if (!fr) continue;
      b.alpha = Math.min(1, b.alpha + (dtv > 0 ? dt : 0));
      if (b.wait > 0) { b.wait -= dtv; continue; }
      b.s += b.dir * b.v * dtv;
      if (b.s >= fr.r.total || b.s <= 0) { b.s = U.clamp(b.s, 0, fr.r.total); b.dir = -b.dir; b.wait = 90; }   // 靠岸停留约 1.5 分钟（游戏时间）后返航
    }
  };
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
    for (const bt of BG.boats) {
      const fr = BG.ferries[bt.ri]; if (!fr || bt.alpha <= 0.01) continue;
      U.posAt(fr.r.pts, fr.r.cum, bt.s, q);
      U.posAt(fr.r.pts, fr.r.cum, U.clamp(bt.s - 0.06, 0, fr.r.total), a); U.posAt(fr.r.pts, fr.r.cum, U.clamp(bt.s + 0.06, 0, fr.r.total), b);
      R.P(a.x, a.y, 0, pa); R.P(b.x, b.y, 0, pb);
      if (Math.max(pa.x, pb.x) < -20 || Math.min(pa.x, pb.x) > R.w + 20 || Math.max(pa.y, pb.y) < -20 || Math.min(pa.y, pb.y) > R.h + 20) continue;
      ctx.globalAlpha = bt.alpha * alpha;
      if (bt.wait <= 0) {   // 尾迹
        const tail = {}; U.posAt(fr.r.pts, fr.r.cum, U.clamp(bt.s - bt.dir * 0.3, 0, fr.r.total), tail); const pt = R.P(tail.x, tail.y, 0, {});
        const pc = bt.dir > 0 ? pa : pb;
        ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = w * 0.6; ctx.beginPath(); ctx.moveTo(pt.x, pt.y); ctx.lineTo(pc.x, pc.y); ctx.stroke();
      }
      ctx.strokeStyle = 'rgba(30,36,44,0.6)'; ctx.lineWidth = w * 1.5 + 1.6; ctx.beginPath(); ctx.moveTo(pa.x, pa.y); ctx.lineTo(pb.x, pb.y); ctx.stroke();
      ctx.strokeStyle = bt.color; ctx.lineWidth = w * 1.5; ctx.stroke();
      ctx.fillStyle = '#2f6b4f'; const mx = (pa.x + pb.x) / 2, my = (pa.y + pb.y) / 2; ctx.beginPath(); ctx.arc(mx, my, Math.max(1.2, w * 0.35), 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  };
})(window.CM);
