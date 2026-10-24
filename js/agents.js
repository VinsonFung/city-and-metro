'use strict';
// 动态对象：列车（按发车间隔调度、加减速平滑运行）、汽车（按路段流量与车速）、行人（沿街道往返车站）
// 代表性展示：数量与模拟人口不一一对应，但与交通变化方向一致。
(function (CM) {
  const U = CM.U, CFG = CM.CFG;
  const CAR_COLORS = ['#ffffff', '#d7dbe0', '#3b4b5e', '#c0392b', '#e9b824', '#2c6fbb', '#8c959f', '#f2f2f2', '#d35400'];
  const CAR_COLORS_OLD = ['#1f2328', '#3b4b5e', '#56635a', '#8c959f', '#d9d4c5', '#6b2f2a'];
  const PED_COLORS = ['#4a5568', '#2d3748', '#9b2c2c', '#2b6cb0', '#744210', '#553c9a', '#2f855a'];
  // 行人衣着：按季节与年代（代表性配色）
  const PED_PAL = {
    mid: PED_COLORS,
    winter: ['#2d3748', '#4a5568', '#1a202c', '#744210', '#2c5282', '#702459', '#4a3b2a', '#9b2c2c'],
    summer: ['#f7fafc', '#90cdf4', '#f6e05e', '#fbb6ce', '#9ae6b4', '#e2e8f0', '#63b3ed', '#f6ad55', '#4a5568'],
    old: ['#2b4c7e', '#4a5568', '#5a6b4e', '#2d3748', '#6b5b4e', '#e2e8f0', '#3c5a7a'],
  };
  // 车辆构成（代表性展示，估算）：份额依次为 私家车、出租车、公交、货车、自行车、摩托车，按地区与年代插值。
  // 只决定画面上车辆的样子，数量仍由交通模型的路段流量决定。
  const VKIND = ['car', 'taxi', 'bus', 'truck', 'bike', 'moto'];
  const MIX = {
    cn: [[1950, [0.06, 0.03, 0.18, 0.28, 0.45, 0]], [1990, [0.12, 0.10, 0.13, 0.17, 0.42, 0.06]], [2000, [0.32, 0.13, 0.10, 0.13, 0.24, 0.08]], [2010, [0.60, 0.12, 0.07, 0.10, 0.08, 0.03]], [2020, [0.71, 0.10, 0.06, 0.09, 0.03, 0.01]]],
    hk: [[1960, [0.34, 0.22, 0.16, 0.24, 0.01, 0.03]], [1990, [0.50, 0.20, 0.12, 0.16, 0, 0.02]], [2020, [0.58, 0.17, 0.11, 0.12, 0, 0.02]]],
    tw: [[1980, [0.28, 0.10, 0.06, 0.12, 0.04, 0.40]], [2000, [0.36, 0.10, 0.05, 0.10, 0.02, 0.37]], [2020, [0.44, 0.08, 0.05, 0.09, 0.03, 0.31]]],
    jp: [[1950, [0.10, 0.18, 0.16, 0.38, 0.12, 0.06]], [1965, [0.34, 0.18, 0.10, 0.30, 0.05, 0.03]], [1990, [0.62, 0.12, 0.06, 0.18, 0.01, 0.01]], [2020, [0.70, 0.10, 0.05, 0.14, 0.01, 0]]],
  };
  const REGION_KEY = { '中国内地': 'cn', '中国香港': 'hk', '中国台湾': 'tw', '日本': 'jp', '英国': 'uk' };
  const VCOL = {
    taxi: { cn: ['#c8372d', '#e8b62c', '#2f7fd0'], hk: ['#d0312d', '#d0312d', '#3a9a4a'], tw: ['#f1c232'], jp: ['#2f7a4f', '#f0c419', '#1f2a44', '#e8e8e8'] },
    bus: { cn: ['#2e7bd1', '#3a9a5a', '#e0b13a'], hk: ['#c8102e', '#e8d9a8', '#f3c300'], tw: ['#2f6fb6', '#e04a3a'], jp: ['#3a8f4e', '#e8e0c8', '#2e6eb5'] },
    truck: ['#3b6ea8', '#4e8a52', '#c4c9cf', '#9b5a3a'],
    bike: ['#2d3748', '#4a5568', '#2b6cb0', '#9b2c2c'],
    moto: ['#c53030', '#2b6cb0', '#e2e8f0', '#2d3748', '#d69e2e'],
  };
  // 车型尺寸（世界单位长度、宽度倍数）与限速（km/h）
  const VDIM = { car: [0.085, 1, 999], taxi: [0.085, 1, 999], bus: [0.15, 1.3, 60], truck: [0.12, 1.15, 70], bike: [0.03, 0.45, 16], moto: [0.04, 0.55, 45] };
  function regionKey() { const m = CM.curMap ? CM.curMap() : null; return (m && REGION_KEY[m.region]) || 'cn'; }
  function interpMix(tbl, y) {
    if (y <= tbl[0][0]) return tbl[0][1];
    for (let i = 1; i < tbl.length; i++) if (y < tbl[i][0]) { const a = tbl[i - 1], b = tbl[i], f = (y - a[0]) / (b[0] - a[0]); return a[1].map(function (v, k) { return v + (b[1][k] - v) * f; }); }
    return tbl[tbl.length - 1][1];
  }
  const pick = function (arr) { return arr[(Math.random() * arr.length) | 0]; };

  function Agents() {
    this.vt = 0;
    this.groups = new Map();
    this.trains = [];
    this.cars = []; this.carIndex = new Map();
    this.peds = []; this.walkers = [];
    this.netRef = null;
    this.treeMaps = new Map();
    this.seq = 0;
    this.fillPending = true;
  }
  CM.Agents = Agents;

  // fillPending：读档、新开局或返回游戏后的第一次同步，按发车间隔把列车铺满全线（立即呈现稳定运行状态）
  Agents.prototype.reset = function () { this.groups.clear(); this.trains = []; this.cars = []; this.carIndex.clear(); this.peds = []; this.walkers = []; this.netRef = null; this.treeMaps.clear(); this.carBuckets = null; this.visibleRoads = null; this.roadRef = null; this.fillPending = true; this.linkInfo = null; };

  Agents.prototype.update = function (dt, game, R) {
    const sp = game.speed > 0 && !game.jumping && !game.pending ? CFG.time.speeds[game.speed - 1] : 0;
    const dtv = dt * sp * CFG.time.visualPerSec;
    this.vt += dtv;
    const model = game.model;
    const W = model.weights(game.clock.minute);
    this.W = W;
    if (model.net !== this.netRef) this.syncNetwork(model.net);
    this.updateTrains(dtv, dt, model, W);
    if (!R.view) return;
    this.updateCars(dtv, dt, game, R, W);
    this.updatePeds(dtv, dt, game, R, W);
  };

  // ---------------- 列车 ----------------
  function legSpeed(Lm, T, a) {
    const disc = a * a * T * T - 4 * a * Lm;
    return (a * T - Math.sqrt(Math.max(0, disc))) / 2;
  }
  function legFrac(t, T, Lm, v, a) {
    if (t <= 0) return 0;
    if (t >= T || Lm <= 1e-9) return 1;   // 零长度区间（两站重合）直接视为到站，避免 0/0
    const ta = v / a;
    let d;
    if (t < ta) d = 0.5 * a * t * t;
    else if (t < T - ta) d = 0.5 * a * ta * ta + v * (t - ta);
    else { const tr = T - t; d = Lm - 0.5 * a * tr * tr; }
    return U.clamp(d / Lm, 0, 1);
  }
  Agents.prototype.syncNetwork = function (net) {
    this.netRef = net;
    const old = this.groups;
    this.groups = new Map();
    this.treeMaps.clear();
    if (!net) { for (const t of this.trains) t.dying = true; return; }
    const mc = CFG.metro, a = mc.accel;
    const C = net.C;
    for (let r = 0; r < C.routes.length; r++) {
      const rt = C.routes[r], n = rt.stIdx.length;
      const dirs = rt.loop ? [0, 1] : [0];
      for (const dir of dirs) {
        const legs = [];
        const mk = function (k, rev, dwell) {
          const Lm = rt.legLenM[k], T = rt.legSec[k];
          return { k: k, rev: rev, d0: rev ? rt.stopDist[k + 1] : rt.stopDist[k], d1: rev ? rt.stopDist[k] : rt.stopDist[k + 1], T: T, Lm: Lm, v: legSpeed(Lm, T, a), dwell: dwell };
        };
        if (!rt.loop) {
          for (let k = 0; k < n - 1; k++) legs.push(mk(k, false, k + 1 === n - 1 ? mc.turnaround : mc.dwell));
          for (let k = n - 2; k >= 0; k--) legs.push(mk(k, true, k === 0 ? mc.turnaround : mc.dwell));
        } else if (dir === 0) {
          for (let k = 0; k < n; k++) legs.push(mk(k, false, mc.dwell));
        } else {
          for (let k = n - 1; k >= 0; k--) legs.push(mk(k, true, mc.dwell));
        }
        let cycle = 0; for (const l of legs) cycle += l.T + l.dwell;
        const key = net.routeKey[r] + '#' + dir + '#' + legs.length;
        const og = old.get(key);
        const g = { key: key, r: r, dir: dir, rt: rt, legs: legs, cycle: cycle, lastDep: og ? og.lastDep : -1e9, count: 0 };
        this.groups.set(key, g);
      }
    }
    // 线路调整：同一运行方案的列车留在原区段继续运行；位置因改线明显变化的列车原地淡出（不瞬移），
    // 这条线随后按发车间隔重新铺满（只对调整前已有列车的线路，新开通的线路仍从起点依次发车）
    const refill = new Set(), tmp = {}, tmp2 = {};
    for (const t of this.trains) {
      if (t.dying) continue;
      const g = this.groups.get(t.gkey), lineId = t.g ? t.g.rt.lineId : null;
      if (!g || t.leg >= g.legs.length) { t.dying = true; if (lineId) refill.add(lineId); continue; }
      if (t.g && t.g !== g) {
        const old = t.g;
        this.trainWorld(t, tmp); t.g = g; this.trainWorld(t, tmp2);
        if (Math.hypot(tmp.x - tmp2.x, tmp.y - tmp2.y) > 0.3) { t.g = old; t.dying = true; refill.add(lineId); continue; }
      }
      t.g = g;
    }
    if (refill.size) this.groups.forEach(function (g) { if (refill.has(g.rt.lineId)) g.refill = true; });
  };
  // 按发车间隔 h 沿整个周转铺满一组列车（第 i 列在 i·h 之前从起点发车）
  Agents.prototype.fillGroup = function (g, h, alpha) {
    const need = Math.max(1, Math.ceil(g.cycle / h));
    for (let i = 0; i < need; i++) {
      let off = i * h, leg = 0;
      while (leg < g.legs.length && off >= g.legs[leg].T + g.legs[leg].dwell) { off -= g.legs[leg].T + g.legs[leg].dwell; leg++; }
      if (leg >= g.legs.length) break;
      this.trains.push({ id: ++this.seq, g: g, gkey: g.key, leg: leg, t: off, alpha: alpha, dying: false, held: false });
      g.count++;
    }
    g.lastDep = this.vt;
    g.refill = false;
  };
  Agents.prototype.updateTrains = function (dtv, dt, model, W) {
    const net = this.netRef;
    this.groups.forEach(function (g) { g.count = 0; });
    for (const t of this.trains) if (!t.dying && t.g) t.g.count++;
    const vt = this.vt;
    if (net) {
      const fill = this.fillPending;
      this.groups.forEach((g) => {
        const f = model.freqAt(g.r, W);
        g.h = f > 0.1 ? 3600 / f : Infinity;
        g.need = isFinite(g.h) ? Math.max(1, Math.ceil(g.cycle / g.h)) : 0;
        if ((fill || g.refill) && isFinite(g.h) && g.count === 0) { this.fillGroup(g, g.h, fill ? 1 : 0); return; }
        g.refill = false;
        if (g.count < g.need && vt >= g.lastDep + g.h) {
          this.trains.push({ id: ++this.seq, g: g, gkey: g.key, leg: 0, t: 0, alpha: 0, dying: false, held: false });
          g.lastDep = vt; g.count++;
        }
      });
      this.fillPending = false;
    }
    for (const t of this.trains) {
      t.alpha = t.dying ? Math.max(0, t.alpha - dt / 0.6) : Math.min(1, t.alpha + dt / 0.6);
      if (t.dying || !t.g) continue;
      const g = t.g;
      let rem = dtv;
      let guard = 0;
      while (rem > 0 && guard++ < 50) {
        const L = g.legs[t.leg];
        const end = L.T + L.dwell;
        if (t.t + rem < end) { t.t += rem; rem = 0; break; }
        rem -= end - t.t;
        t.leg++; t.t = 0;
        if (t.leg >= g.legs.length) {
          t.leg = 0;
          if (g.count > g.need) { t.dying = true; g.count--; t.t = 0; t.leg = g.legs.length - 1; t.t = g.legs[t.leg].T + g.legs[t.leg].dwell; rem = 0; break; }
          // 发车间隔控制：在控制点等候
          const due = g.lastDep + g.h;
          if (vt < due) { t.t = -(due - vt); }
          g.lastDep = Math.max(vt, isFinite(due) ? due : vt);
        }
      }
    }
    this.trains = this.trains.filter(function (t) { return !(t.dying && t.alpha <= 0); });
  };
  Agents.prototype.trainPos = function (t, out) {
    const g = t.g, L = g.legs[t.leg], rt = g.rt;
    const f = t.t < 0 ? 0 : legFrac(Math.min(t.t, L.T), L.T, L.Lm, L.v, CFG.metro.accel);
    const d = L.d0 + (L.d1 - L.d0) * f;
    out.d = d; out.fwd = L.d1 >= L.d0; out.k = L.k; out.rev = L.rev;
    return out;
  };
  // 车身：车厢长约 20 m、车厢之间留 1.6 m 间隙；车身中点即运行里程，停站时车身对准站台中心。
  // 非环线在端点处整体平移（车尾不越出线路），折返前后位置连续。
  const CAR_M = 20, GAP_M = 1.6;
  function wrapD(d, total, loop) { return loop ? ((d % total) + total) % total : U.clamp(d, 0, total); }
  Agents.prototype.trainSpan = function (t, pos, out) {
    const rt = t.g.rt, total = rt.cum[rt.cum.length - 1];
    const Lt = Math.max(CAR_M * rt.cars / CFG.CELL_M, 0.12), dir = pos.fwd ? 1 : -1;
    let head = pos.d + dir * Lt / 2, rear = pos.d - dir * Lt / 2;
    if (!rt.loop) { const lo = Math.min(head, rear), hi = Math.max(head, rear), sh = lo < 0 ? -lo : (hi > total ? total - hi : 0); head += sh; rear += sh; }
    out.head = head; out.rear = rear; out.dir = dir; out.Lt = Lt; out.total = total; out.loop = rt.loop;
    return out;
  };
  // 列车中点的世界坐标（线路调整时判断是否需要淡出）
  Agents.prototype.trainWorld = function (t, out) { const pos = this.trainPos(t, {}); return U.posAt(t.g.rt.pts, t.g.rt.cum, pos.d, out); };
  // 运行状态：行驶 run / 停站 dwell / 起点等候发车 hold。只由当前区段与区段内时间决定（纯函数），
  // 暂停、加速、跳月、切换视图与读档后都按同一时刻得到同一结果，不另存动画状态。
  // 车门：停稳 2 秒后开启（历时 2 秒），距发车 6 秒开始关闭，发车前 4 秒已完全关闭；行驶中恒为关闭。
  const DOOR = { delay: 2, open: 2, closeLead: 6, close: 2, walk: 3, gap: 1.1 };
  Agents.DOOR = DOOR;
  Agents.prototype.phase = function (t, out) {
    out = out || {};
    out.state = 'run'; out.door = 0; out.since = 0; out.until = 0;
    const g = t.g, L = g && g.legs[t.leg];
    if (!L) return out;
    let until;
    if (t.t < 0) { out.state = 'hold'; out.since = 1e9; until = -t.t; }
    else if (t.t >= L.T) {
      out.state = 'dwell'; out.since = t.t - L.T; until = L.T + L.dwell - t.t;
      // 周转末端：发车受间隔控制，把预计等候计入「距发车」，车门不会先关再开
      if (t.leg === g.legs.length - 1 && isFinite(g.h)) until += Math.max(0, g.lastDep + g.h - (this.vt + until));
    } else return out;
    out.until = until;
    const op = U.clamp((out.since - DOOR.delay) / DOOR.open, 0, 1), cl = U.clamp((until - (DOOR.closeLead - DOOR.close)) / DOOR.close, 0, 1);
    out.door = Math.min(op, cl);
    return out;
  };
  // 代表性乘客人数：只按满载率决定（每次停站最多 8 人），不逐人模拟客流
  function paxCount(lf) { return lf <= 0.004 ? 0 : Math.min(8, Math.max(1, Math.round(lf * 6))); }
  Agents.paxCount = paxCount;
  Agents.prototype.legLoad = function (t, L, model, W) {
    const net = this.netRef, re = net && net.rideEdge && net.rideEdge[t.g.r];
    if (!model || !re || !W) return 0;
    const f = model.freqAt(t.g.r, W);
    return f > 0 ? model.edgeLoadAt(re[2 * L.k + (L.rev ? 1 : 0)], W) / (f * t.g.rt.cap) : 0;
  };
  Agents.prototype.drawTrains = function (ctx, R, ui) {
    const net = this.netRef; if (!net) return;
    const z = R.z, under = U.smooth(R.cam.under), game = CM.game;
    const model = game && !game.preview ? game.model : null;
    const W = this.W;
    const tmp = {}, sp = {}, ph = {}, q = {}, A = {}, B = {};
    const width = U.clamp(z * 0.075, 2.4, 7.5);
    const v = R.view, hl = ui && ui.highlightLine, night = !!(R.th && R.th.night);
    const tier = R.detail ? R.detail.tier : 0, carLen = CAR_M / CFG.CELL_M, carGap = GAP_M / CFG.CELL_M;
    const showWin = z >= 22, showDoor = z >= 30, showPax = z >= 30 && tier < 2 && (!game || game.speed <= 2);
    let paxBudget = Math.round(CFG.perf.maxRiders * (tier === 1 ? 0.5 : 1));
    const UD = CM.RENDER_CONST.UNDER_DEPTH;
    const joints = this._joints || (this._joints = []);
    for (const t of this.trains) {
      if (!t.g || t.alpha <= 0.01) continue;
      const rt = t.g.rt;
      this.trainPos(t, tmp);
      U.posAt(rt.pts, rt.cum, tmp.d, q);
      if (R.follow !== t && (q.x < v.x0 - 1 || q.x > v.x1 + 1 || q.y < v.y0 - 1 || q.y > v.y1 + 1)) continue;
      this.trainSpan(t, tmp, sp);
      const off = 0.055 * sp.dir;
      // 车厢接缝的屏幕坐标：沿实际轨道曲线取点，转弯时各节车厢分别转向
      const nCar = z >= 14 ? rt.cars : 1, step = z >= 14 ? carLen : sp.Lt;
      for (let k = 0; k <= nCar; k++) {
        const dd = k === nCar ? sp.rear : sp.head - sp.dir * k * step;
        U.posAt(rt.pts, rt.cum, wrapD(dd, sp.total, sp.loop), q);
        let hh = heightAt(rt, q); if (hh < 0) hh = hh * under * UD;
        const jp = joints[k] || (joints[k] = {});
        R.P(q.x - Math.sin(q.a) * off, q.y + Math.cos(q.a) * off, hh, jp);
        if (k === 0) { jp.h = heightAt(rt, q); jp.wx = q.x; jp.wy = q.y; }
      }
      const head = joints[0], tail = joints[nCar];
      if (R.follow !== t && (Math.max(head.x, tail.x) < -12 || Math.min(head.x, tail.x) > R.w + 12 || Math.max(head.y, tail.y) < -12 || Math.min(head.y, tail.y) > R.h + 12)) continue;
      t.sx = (head.x + tail.x) / 2; t.sy = (head.y + tail.y) / 2; t.drawn = R.frame;   // 点击列车（跟随模式）与声音用
      let alpha = t.alpha;
      const seg = rt.segRefs[tmp.k], cs = net.C.segs.get(seg.id);
      const segType = cs ? cs.seg.type : 'underground';
      t.segType = segType; t.hh = head.h;
      if (head.h < -0.01) alpha *= U.lerp(0.55, 1, under);
      else if (under > 0) alpha *= U.lerp(1, 0.4, under);
      if (hl && hl !== rt.lineId) alpha *= 0.3;
      ctx.globalAlpha = alpha;
      // 跟随中的列车：脉动圆环
      if (R.follow === t) {
        const pr = 0.5 + 0.5 * Math.sin(R.time * 5), rr = Math.max(9, Math.hypot(head.x - tail.x, head.y - tail.y) / 2 + 6);
        ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(t.sx, t.sy, rr + pr * 3, 0, Math.PI * 2); ctx.stroke();
        ctx.strokeStyle = rt.color; ctx.lineWidth = 2.2; ctx.stroke();
      }
      if (z < 7) {
        ctx.fillStyle = rt.color; ctx.beginPath(); ctx.arc(head.x, head.y, 2.6, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; ctx.stroke();
        continue;
      }
      const L = t.g.legs[t.leg];
      const lf = z >= 14 && L ? this.legLoad(t, L, model, W) : 0;
      // 车体：外廓 + 线路色；近景各节车厢分开画（接缝留空）
      const gapPx = nCar > 1 ? Math.min(0.5, carGap / carLen) : 0;
      const carPath = function (k) {
        const a = joints[k], b = joints[k + 1], g0 = k > 0 ? gapPx / 2 : 0, g1 = k < nCar - 1 ? gapPx / 2 : 0;
        ctx.moveTo(a.x + (b.x - a.x) * g0, a.y + (b.y - a.y) * g0); ctx.lineTo(b.x + (a.x - b.x) * g1, b.y + (a.y - b.y) * g1);
      };
      ctx.lineCap = nCar > 1 ? 'butt' : 'round';
      ctx.strokeStyle = 'rgba(20,24,30,0.55)'; ctx.lineWidth = width + 2;
      ctx.beginPath(); for (let k = 0; k < nCar; k++) carPath(k); ctx.stroke();
      ctx.strokeStyle = rt.color; ctx.lineWidth = width;
      ctx.beginPath(); for (let k = 0; k < nCar; k++) carPath(k); ctx.stroke();
      if (nCar > 1) {
        // 车头、车尾：圆润的端部
        ctx.fillStyle = rt.color;
        ctx.beginPath(); ctx.arc(head.x, head.y, width / 2, 0, Math.PI * 2); ctx.arc(tail.x, tail.y, width / 2, 0, Math.PI * 2); ctx.fill();
      }
      ph.door = 0;
      if (z >= 14) {
        this.phase(t, ph);
        // 车窗：夜间亮灯；过度拥挤时偏红
        ctx.strokeStyle = night ? 'rgba(255,228,150,0.95)' : (lf > 1 ? 'rgba(255,200,200,0.95)' : 'rgba(255,255,255,0.85)');
        ctx.lineWidth = Math.max(1, width * 0.28); ctx.lineCap = 'butt';
        ctx.beginPath();
        if (showWin && nCar > 1) for (let k = 0; k < nCar; k++) { const a = joints[k], b = joints[k + 1]; ctx.moveTo(a.x + (b.x - a.x) * 0.16, a.y + (b.y - a.y) * 0.16); ctx.lineTo(a.x + (b.x - a.x) * 0.84, a.y + (b.y - a.y) * 0.84); }
        else { ctx.setLineDash([width * 0.7, width * 0.5]); ctx.moveTo(tail.x, tail.y); ctx.lineTo(head.x, head.y); }
        ctx.stroke(); ctx.setLineDash([]);
        // 前照灯（夜间更亮，带光晕）与尾灯
        const hx = head.x - joints[1].x, hy = head.y - joints[1].y, hlen = Math.hypot(hx, hy) || 1, ux = hx / hlen, uy = hy / hlen;
        ctx.fillStyle = night ? 'rgba(255,246,210,1)' : '#ffffff';
        ctx.beginPath(); ctx.arc(head.x + ux * width * 0.25, head.y + uy * width * 0.25, Math.max(1, width * 0.22), 0, Math.PI * 2); ctx.fill();
        if (night && z >= 18 && ph.state === 'run') {
          ctx.globalAlpha = alpha * 0.35; ctx.beginPath(); ctx.arc(head.x + ux * width * 1.2, head.y + uy * width * 1.2, width * 0.9, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = alpha;
          ctx.fillStyle = 'rgba(255,70,60,0.9)'; ctx.beginPath(); ctx.arc(tail.x, tail.y, Math.max(0.8, width * 0.18), 0, Math.PI * 2); ctx.fill();
        }
        // 车门：停站开门时在车厢两侧显示门洞（行驶中 ph.door 恒为 0）
        if (showDoor && ph.door > 0 && nCar > 1) {
          ctx.strokeStyle = night ? 'rgba(255,236,170,0.95)' : 'rgba(255,252,235,0.95)'; ctx.lineWidth = Math.max(1.2, width * 0.22); ctx.lineCap = 'butt';
          ctx.beginPath();
          for (let k = 0; k < nCar; k++) {
            const a = joints[k], b = joints[k + 1], dx = b.x - a.x, dy = b.y - a.y, l = Math.hypot(dx, dy) || 1, nx = -dy / l, ny = dx / l;
            const o0 = width / 2 - 0.5, o1 = width / 2 + 0.5 + 1.6 * ph.door;
            for (const f of [0.3, 0.7]) { const x = a.x + dx * f, y = a.y + dy * f; for (const s of [-1, 1]) { ctx.moveTo(x + nx * o0 * s, y + ny * o0 * s); ctx.lineTo(x + nx * o1 * s, y + ny * o1 * s); } }
          }
          ctx.stroke();
        }
        // 代表性乘客：下车（按到站区间的满载率）→ 上车（按发车区间的满载率），沿门口与站台之间走动
        if (showPax && ph.door > 0 && nCar > 1 && paxBudget > 0 && L) {
          const next = ph.state === 'hold' ? L : t.g.legs[(t.leg + 1) % t.g.legs.length];
          const nA = ph.state === 'dwell' ? paxCount(this.legLoad(t, L, model, W)) : 0, nB = paxCount(this.legLoad(t, next, model, W));
          const stop = t.id * 131 + t.leg * 17;
          for (let j = 0; j < nA + nB && paxBudget > 0; j++) {
            const board = j >= nA, jj = board ? j - nA : j;
            const p = board ? 1 - (ph.until - (DOOR.closeLead + 0.4 + jj * DOOR.gap)) / DOOR.walk : (ph.since - (DOOR.delay + DOOR.open * 0.5 + jj * DOOR.gap)) / DOOR.walk;
            if (p <= 0 || p >= 1) continue;
            const k = Math.floor(U.hash2(stop, j, 5) * nCar), a = joints[k], b = joints[k + 1], f = U.hash2(stop, j, 6) < 0.5 ? 0.3 : 0.7, s = U.hash2(stop, j, 7) < 0.5 ? -1 : 1;
            const dx = b.x - a.x, dy = b.y - a.y, l = Math.hypot(dx, dy) || 1, nx = -dy / l * s, ny = dx / l * s, ux2 = dx / l, uy2 = dy / l;
            const x0 = a.x + dx * f + nx * (width / 2 + 0.8), y0 = a.y + dy * f + ny * (width / 2 + 0.8);
            const spread = (U.hash2(stop, j, 8) - 0.5) * width * 3, far = width / 2 + 3 + width * 0.6;
            const x1 = a.x + dx * f + nx * far + ux2 * spread, y1 = a.y + dy * f + ny * far + uy2 * spread;
            const u = U.smooth(p), from = board ? [x1, y1] : [x0, y0], to = board ? [x0, y0] : [x1, y1];
            ctx.globalAlpha = alpha * Math.min(1, (board ? 1 - p : p) * 4 + 0.25) * Math.min(1, (board ? p : 1 - p) * 6);
            const pal = this.pal || PED_COLORS;
            ctx.fillStyle = pal[(U.hash2(stop, j, 9) * pal.length) | 0];
            ctx.beginPath(); ctx.arc(U.lerp(from[0], to[0], u), U.lerp(from[1], to[1], u), Math.max(1, width * 0.2), 0, Math.PI * 2); ctx.fill();
            paxBudget--;
          }
          ctx.globalAlpha = alpha;
        }
      }
      t.door = ph.door; t.state = ph.state;
    }
    ctx.globalAlpha = 1; ctx.lineCap = 'round';
  };
  Agents.prototype.heightAt = function (rt, p) { return heightAt(rt, p); };
  // 当前区间的运行速度（m/s）：加速—匀速—减速；停站与等候时为 0
  Agents.prototype.trainSpeed = function (t) {
    const L = t.g && t.g.legs[t.leg]; if (!L || t.t < 0 || t.t >= L.T) return 0;
    const a = CFG.metro.accel, ta = L.v / a;
    return t.t < ta ? a * t.t : (t.t < L.T - ta ? L.v : a * (L.T - t.t));
  };
  function heightAt(rt, p) {
    const i = p.i, f = p.f || 0;
    const a = rt.hs[i], b = rt.hs[Math.min(rt.hs.length - 1, i + 1)];
    return a + (b - a) * f;
  }

  // ---------------- 开始界面背景：列车与汽车（不依赖交通模型） ----------------
  // 列车按固定班次在示意线路上往返（开场即按间隔铺满全线），汽车按道路等级给出的示意流量在真实道路上行驶
  const PV_FREQ = 12, PV_VOL = [0, 0, 300, 950, 1800];
  const PV_MODEL = { freqAt: function () { return PV_FREQ; } };
  Agents.prototype.updatePreview = function (dt, pg, R) {
    if (!pg || !pg.compiled) return;
    if (!pg.pnet) pg.pnet = { C: pg.compiled, routeKey: pg.compiled.routes.map(function (r, i) { return 'pv' + i; }), rideEdge: [] };
    // 开场即按间隔铺满全线（reset 后的第一次 updateTrains 完成）
    if (this.netRef !== pg.pnet) { this.reset(); this.syncNetwork(pg.pnet); }
    const dtv = dt * CFG.time.visualPerSec * 1.5;
    this.vt += dtv; this.W = null;
    this.updateTrains(dtv, dt, PV_MODEL, null);
    if (!R.view) return;
    const road = pg.city.car;
    if (!pg.pmodel) pg.pmodel = {
      road: road,
      arcVolAt: function (a) { const L = road.links[a >> 1]; return (PV_VOL[L.cls] || 0) * (0.4 + 0.9 * U.hash2(a, 3, 7)); },
      arcRatioAt: function (a) { return 1 + 0.7 * U.hash2(a, 5, 9); },
    };
    this.updateCars(dtv, dt, { model: pg.pmodel, city: pg.city, clock: pg.clock }, R, null);
  };

  // ---------------- 汽车 ----------------
  Agents.prototype.updateCars = function (dtv, dt, game, R, W) {
    const model = game.model, road = model.road, city = game.city;
    const z = R.z, v = R.view;
    if (this.roadRef !== road) {
      this.cars = []; this.carIndex.clear(); this.walkers = []; this.linkInfo = null;
      this.roadRef = road; this.carBuckets = CM.Geo.buckets(road.links, 8, city.W, city.H); this.visibleRoads = null;
    }
    const show = R.agentsOn && R.layerFade < 0.95 && z >= 7 && R.cam.under < 0.95;
    const margin = 3;
    const inView = function (L) { const b = L.bbox; return b[2] >= v.x0 - margin && b[0] <= v.x1 + margin && b[3] >= v.y0 - margin && b[1] <= v.y1 + margin; };
    // 移动
    const kmh2cell = 1 / 3.6 / CFG.CELL_M;
    const idx = this.carIndex;
    for (const c of this.cars) {
      c.alpha = c.dying ? c.alpha - dt / 0.35 : Math.min(1, c.alpha + dt / 0.5);
      if (dtv <= 0) continue;
      const L = road.links[c.link];
      const a = 2 * c.link + c.dir;
      const ratio = model.arcRatioAt(a, W);
      // 车速：道路自由流速度 ÷ 拥堵系数，自行车与摩托车另有上限；明显低于自由流时亮刹车灯
      const vmax = VDIM[c.kind][2], free = Math.min(CFG.road.speed[L.cls], vmax);
      const vTarget = Math.min(CFG.road.speed[L.cls] / Math.min(8, ratio), vmax) * kmh2cell;
      c.v = U.lerp(c.v, vTarget, Math.min(1, dt * 2));
      c.brake = c.v < free * kmh2cell * 0.45;
      c.s += c.v * dtv;
      const len = L.cum[L.cum.length - 1];
      if (c.s >= len) {
        // 进入下一路段
        const node = c.dir === 0 ? L.b : L.a;
        let pick = -1, tot = 0;
        for (let k = road.outStart[node]; k < road.outStart[node + 1]; k++) {
          const arc = road.outArc[k];
          if ((arc >> 1) === c.link) continue;
          const L2 = road.links[arc >> 1];
          if (L2.cls < 2 || !L2.real) continue;
          const w = model.arcVolAt(arc, W) + 5;
          tot += w;
          if (Math.random() * tot < w) pick = arc;
        }
        if (pick < 0 || !inView(road.links[pick >> 1])) { c.dead = true; continue; }
        this.idxRemove(c);
        c.link = pick >> 1; c.dir = pick & 1; c.s = c.s - len;
        this.idxAdd(c);
      }
    }
    // 跟车：同路段、同方向、同车道保持间距（按两车车长；拥堵时自然排成车队）。自行车与摩托车走路边车道
    idx.forEach(function (list) {
      if (list.length < 2) return;
      list.sort(function (a, b) { return b.s - a.s; });
      for (let i = 1; i < list.length; i++) {
        const gap = Math.max(0.045, (VDIM[list[i].kind][0] + VDIM[list[i - 1].kind][0]) * 0.45);
        if (list[i].s > list[i - 1].s - gap) { list[i].s = list[i - 1].s - gap; list[i].v = Math.min(list[i].v, list[i - 1].v); }
      }
    });
    // 清理
    if (this.cars.some(function (c) { return c.dead || c.alpha <= 0 || c.s < -0.5; })) {
      const keep = [];
      for (const c of this.cars) { if (c.dead || (c.dying && c.alpha <= 0) || c.s < -0.5) this.idxRemove(c); else keep.push(c); }
      this.cars = keep;
    }
    if (!show) { for (const c of this.cars) c.dying = true; return; }
    // 生成：数量按路段流量；车型按地区与年代的构成，并随路边用地（商业区多出租车与公交、工业区多货车）与时段调整
    const clock = game.clock || { y: 2000, minute: 600 }, hr = Math.floor(clock.minute / 60) % 24, rk = regionKey();
    const mixKey = rk + ':' + clock.y;
    if (this.mixKey !== mixKey) { this.mixKey = mixKey; this.mix = interpMix(MIX[rk], clock.y); this.oldCars = clock.y < 1970; }
    const night = hr < 6 || hr >= 22, peak = (hr >= 7 && hr < 9) || (hr >= 17 && hr < 19);
    const kindFor = (L) => {
      const info = this.linkLU(L, city), w = this.mix, mod = [1, 1, 1, 1, 1, 1];
      if (info === LU_COM) { mod[1] = 1.9; mod[2] = 1.3; mod[3] = 0.6; }
      else if (info === LU_IND) { mod[3] = 2.6; mod[1] = 0.5; }
      if (L.cls === 4) { mod[4] = 0; mod[5] *= 0.3; mod[3] *= 1.4; }
      if (night) { mod[2] *= 0.45; mod[4] *= 0.35; mod[3] *= 1.3; } else if (peak) { mod[4] *= 1.2; mod[2] *= 1.2; }
      let tot = 0; for (let k = 0; k < 6; k++) tot += w[k] * mod[k];
      let r = Math.random() * tot;
      for (let k = 0; k < 6; k++) { r -= w[k] * mod[k]; if (r <= 0) return VKIND[k]; }
      return 'car';
    };
    const colorFor = (kind) => {
      if (kind === 'taxi' || kind === 'bus') return pick(VCOL[kind][rk] || VCOL[kind].cn);
      if (kind === 'car') return pick(this.oldCars ? CAR_COLORS_OLD : CAR_COLORS);
      return pick(VCOL[kind]);
    };
    const vis = 0.09 * U.clamp(z / 22, 0.25, 1.2);
    let budget = 60;
    const density = z >= 28 || !R.detail ? 1 : (R.detail.tier === 2 ? 0.55 : R.detail.tier === 1 ? 0.8 : 1);
    const maxCars = Math.round(CFG.perf.maxCars * density);
    let total = this.cars.length;
    const step = this.frameFlip = !this.frameFlip;
    const bk = this.carBuckets, viewKey = [Math.floor((v.x0 - margin) / bk.tile), Math.floor((v.y0 - margin) / bk.tile), Math.floor((v.x1 + margin) / bk.tile), Math.floor((v.y1 + margin) / bk.tile)].join(':');
    if (!this.visibleRoads || this.visibleRoads.key !== viewKey) this.visibleRoads = { key: viewKey, ids: CM.Geo.query(bk, v.x0 - margin, v.y0 - margin, v.x1 + margin, v.y1 + margin).sort(function (a, b) { return a - b; }) };
    for (const id of this.visibleRoads.ids) {
      const L = road.links[id];
      if (L.cls < 2 || !L.real || !inView(L)) continue;
      if (((L.id & 1) === 1) !== step) continue;
      for (let dir = 0; dir < 2; dir++) {
        const a = 2 * L.id + dir;
        const vol = model.arcVolAt(a, W);
        if (vol < 5) continue;
        const ratio = model.arcRatioAt(a, W);
        const sp = CFG.road.speed[L.cls] / Math.min(8, ratio);
        const lenKm = L.lenM / 1000;
        const target = Math.min(lenKm * 30, vol / sp * lenKm * vis) * density;
        const list = idx.get(2 * a), slow = idx.get(2 * a + 1);
        const have = (list ? list.length : 0) + (slow ? slow.length : 0);
        if (have < target - 0.5 && budget > 0 && total < maxCars) {
          const len = L.cum[L.cum.length - 1];
          const s = Math.random() * len, kind = kindFor(L), lane = kind === 'bike' || kind === 'moto' ? 1 : 0, same = lane ? slow : list;
          let ok = true;
          if (same) for (const o of same) if (Math.abs(o.s - s) < 0.09) { ok = false; break; }
          if (ok) {
            const c = { link: L.id, dir: dir, s: s, v: Math.min(sp, VDIM[kind][2]) * kmh2cell, alpha: 0, kind: kind, lane: lane, color: colorFor(kind), ang: null };
            if (kind === 'bike' || kind === 'moto') c.rider = pick(this.pal || PED_COLORS);
            this.cars.push(c); this.idxAdd(c); budget--; total++;
          }
        } else if (have > target * 1.4 + 1) {
          for (const c of (list || slow)) if (!c.dying) { c.dying = true; break; }
        }
      }
    }
  };
  // 索引键：路段方向 × 车道（0 机动车道、1 路边的自行车 / 摩托车道）
  Agents.prototype.idxAdd = function (c) { const k = 2 * (2 * c.link + c.dir) + (c.lane || 0); let l = this.carIndex.get(k); if (!l) { l = []; this.carIndex.set(k, l); } l.push(c); };
  Agents.prototype.idxRemove = function (c) { const k = 2 * (2 * c.link + c.dir) + (c.lane || 0); const l = this.carIndex.get(k); if (!l) return; const i = l.indexOf(c); if (i >= 0) l.splice(i, 1); if (!l.length) this.carIndex.delete(k); };
  // 路段中点所在街区的用地（缓存）：用于车型构成与街道行人
  const LU = CM.LU, LU_COM = LU.COM, LU_IND = LU.IND;
  Agents.prototype.linkLU = function (L, city) {
    let m = this.linkInfo;
    if (!m || m.city !== city || m.road !== this.roadRef || m.version !== city.version) m = this.linkInfo = { city: city, road: this.roadRef, version: city.version, lu: new Map(), act: new Map() };
    let v = m.lu.get(L.id);
    if (v === undefined) { const p = L.pts[L.pts.length >> 1], c = city.cellAt(p[0], p[1]); v = c < 0 ? 0 : city.lu[c]; m.lu.set(L.id, v); m.act.set(L.id, c < 0 ? 0 : U.clamp((city.pop[c] + city.jobs[c]) / 3000, 0, 1.6)); }
    return v;
  };
  Agents.prototype.carWorld = function (c, road, out) {
    const L = road.links[c.link];
    const len = L.cum[L.cum.length - 1];
    const s = c.dir === 0 ? U.clamp(c.s, 0, len) : U.clamp(len - c.s, 0, len);
    U.posAt(L.pts, L.cum, s, out);
    let ang = out.a + (c.dir === 1 ? Math.PI : 0);
    if (c.ang == null) c.ang = ang;
    let da = ang - c.ang; while (da > Math.PI) da -= 2 * Math.PI; while (da < -Math.PI) da += 2 * Math.PI;
    c.ang += da * 0.25;
    const off = (L.cls === 4 ? 0.085 : (L.cls === 3 ? 0.06 : 0.035)) + (c.lane ? 0.028 : 0);
    out.x += -Math.sin(ang) * off; out.y += Math.cos(ang) * off;
    out.ang = c.ang;
    return out;
  };

  // ---------------- 行人 ----------------
  Agents.prototype.treeMap = function (k, tree) {
    let m = this.treeMaps.get(k);
    if (!m) { m = new Map(); for (let q = 0; q < tree.verts.length; q++) m.set(tree.verts[q], q); this.treeMaps.set(k, m); }
    return m;
  };
  Agents.prototype.updatePeds = function (dtv, dt, game, R, W) {
    const model = game.model, net = model.net, city = game.city;
    const z = R.z, v = R.view;
    const show = R.agentsOn && R.layerFade < 0.95 && z >= 18 && R.cam.under < 0.9;
    const mps2cell = 1 / CFG.CELL_M;
    this.pal = this.palette(game.clock);
    for (const p of this.peds) {
      p.alpha = p.dying ? p.alpha - dt / 0.4 : Math.min(1, p.alpha + dt / 0.5);
      p.s += p.v * dtv;
      if (p.s >= p.len) { p.s = p.len; p.dying = true; }
    }
    this.peds = this.peds.filter(function (p) { return !(p.dying && p.alpha <= 0); });
    this.updateWalkers(dtv, dt, game, R, show && z >= 22);
    if (!show) { for (const p of this.peds) p.dying = true; return; }
    if (!net) return;
    let budget = 25;
    const C = net.C, acc = net.acc;
    const counts = new Map();
    for (const p of this.peds) if (!p.dying) counts.set(p.st, (counts.get(p.st) || 0) + 1);
    let total = this.peds.length;
    for (let k = 0; k < C.stations.length && budget > 0; k++) {
      const s = C.stations[k];
      if (s.x < v.x0 || s.x > v.x1 || s.y < v.y0 || s.y > v.y1) continue;
      const tree = acc.trees[k];
      if (!tree || tree.verts.length < 2) continue;
      const flow = model.stFlowAt(k, W, 'stIn') + model.stFlowAt(k, W, 'stOut');
      const target = Math.min(36, flow * 0.006 * U.clamp(z / 30, 0.5, 1.5));
      if ((counts.get(k) || 0) >= target || total >= CFG.perf.maxPeds) continue;
      // 随机起点（步行 600 m 内）
      const m = this.treeMap(k, tree);
      let q = (Math.random() * tree.verts.length) | 0;
      if (tree.dist[q] > 650 || tree.dist[q] < 60) continue;
      const pts = [];
      let vtx = tree.verts[q], guard = 0;
      const side = (Math.random() - 0.5) * 0.12;
      while (vtx >= 0 && guard++ < 80) {
        pts.push([city.vx[vtx] + side, city.vy[vtx] + side]);
        const qi = m.get(vtx); if (qi === undefined) break;
        vtx = tree.pred[qi];
      }
      pts.push([s.x + side * 0.3, s.y + side * 0.3]);
      const inbound = Math.random() < (model.stFlowAt(k, W, 'stIn') + 1) / (flow + 2);
      if (!inbound) pts.reverse();
      const cum = U.cumLen(pts);
      const len = cum[cum.length - 1];
      if (len < 0.2) continue;
      this.peds.push({ pts: pts, cum: cum, len: len, s: 0, v: (1.1 + Math.random() * 0.5) * mps2cell, alpha: 0, st: k, color: pick(this.pal) });
      budget--; total++;
    }
  };
  // 衣着配色：夏季明亮、冬季（东京、杭州）深色；1970 年代以前的内地与 1960 年代以前的东京以蓝灰绿为主
  Agents.prototype.palette = function (clock) {
    if (!clock) return PED_COLORS;
    const rk = regionKey(), m = clock.m, cold = CM.mapId === 'tk' || CM.mapId === 'hz';
    if ((rk === 'cn' && clock.y < 1978) || (rk === 'jp' && clock.y < 1962)) return PED_PAL.old;
    if (m >= 6 && m <= 8) return PED_PAL.summer;
    if (cold && (m === 12 || m <= 2)) return PED_PAL.winter;
    return PED_PAL.mid;
  };
  // ---------------- 街道行人（代表性） ----------------
  // 沿可见的主次干道人行道走一小段：数量按路边街区的人口与岗位、用地（商业区最多、工业区很少）、时段和周末决定；
  // 只在近景出现，总数有上限，并随自动细节档位减少。不参与交通模拟。
  const WALK_ACT = [0.05, 0.03, 0.02, 0.02, 0.03, 0.08, 0.3, 0.7, 0.8, 0.7, 0.75, 0.85, 0.95, 0.85, 0.8, 0.8, 0.85, 0.95, 1, 0.9, 0.75, 0.55, 0.3, 0.12];
  const WALK_LU = [0.1, 0.8, 1.6, 0.15, 1.2, 0.6, 0.7, 0, 0.2, 0.1, 0.9];
  Agents.prototype.updateWalkers = function (dtv, dt, game, R, show) {
    const road = this.roadRef, city = game.city, list = this.walkers;
    for (const w of list) {
      w.alpha = w.dying ? w.alpha - dt / 0.4 : Math.min(1, w.alpha + dt / 0.5);
      w.s += w.dir * w.v * dtv;
      if (w.s < 0 || w.s > w.len) { w.s = U.clamp(w.s, 0, w.len); w.dying = true; }
    }
    if (list.some(function (w) { return w.dying && w.alpha <= 0; })) this.walkers = list.filter(function (w) { return !(w.dying && w.alpha <= 0); });
    if (!show || !road || !this.visibleRoads) { for (const w of this.walkers) w.dying = true; return; }
    const tier = R.detail ? R.detail.tier : 0, maxW = Math.round(CFG.perf.maxWalkers * (tier === 2 ? 0.4 : tier === 1 ? 0.7 : 1));
    let active = 0;
    for (const w of this.walkers) if (!w.dying && ++active > maxW) w.dying = true;
    if (this.walkers.length >= maxW) return;
    const clock = game.clock, hr = Math.floor(clock.minute / 60) % 24;
    const we = CM.Model && CM.Model.dayType ? CM.Model.dayType(clock.y, clock.m, clock.d) === 'we' : false;
    const counts = new Map();
    for (const w of this.walkers) if (!w.dying) counts.set(w.link, (counts.get(w.link) || 0) + 1);
    const ids = this.visibleRoads.ids, n = ids.length, v = R.view, zf = U.clamp(R.z / 36, 0.6, 1.4);
    let budget = 6, total = this.walkers.length;
    const start = (this.walkStart = ((this.walkStart || 0) + 37) % Math.max(1, n));
    for (let q = 0; q < n && budget > 0 && total < maxW; q++) {
      const L = road.links[ids[(start + q) % n]];
      if (L.cls < 2 || L.cls > 3 || !L.real) continue;
      const mid = L.pts[L.pts.length >> 1];
      if (mid[0] < v.x0 || mid[0] > v.x1 || mid[1] < v.y0 || mid[1] > v.y1) continue;
      const lu = this.linkLU(L, city), act = this.linkInfo.act.get(L.id);
      let k = WALK_ACT[hr] * (WALK_LU[lu] || 0);
      if (lu === LU_COM && hr >= 18 && hr < 23) k *= 1.35;     // 商业区的夜间人流
      if (we) k *= lu === LU_COM ? 1.4 : (lu === LU_IND ? 0.4 : 0.9);
      const target = Math.min(5, L.lenM / 1000 * 9 * act * k * zf);
      if ((counts.get(L.id) || 0) >= target - 0.3) continue;
      const len = L.cum[L.cum.length - 1];
      this.walkers.push({ link: L.id, side: Math.random() < 0.5 ? -1 : 1, off: (L.cls === 3 ? 0.1 : 0.072) + Math.random() * 0.012, s: Math.random() * len, dir: Math.random() < 0.5 ? -1 : 1, len: len, v: (1.0 + Math.random() * 0.5) / CFG.CELL_M, alpha: 0, color: pick(this.pal) });
      counts.set(L.id, (counts.get(L.id) || 0) + 1);
      budget--; total++;
    }
  };
  Agents.prototype.walkerWorld = function (w, out) {
    const L = this.roadRef.links[w.link];
    U.posAt(L.pts, L.cum, w.s, out);
    out.x += -Math.sin(out.a) * w.off * w.side; out.y += Math.cos(out.a) * w.off * w.side;
    return out;
  };

  // ---------------- 绘制（汽车与行人） ----------------
  Agents.prototype.bucket = function (C) {
    const out = new Map(), road = this.roadRef, tmp = {};
    if (road) for (const c of this.cars) {
      if (c.alpha <= 0.01) continue;
      this.carWorld(c, road, tmp);
      c.wx = tmp.x; c.wy = tmp.y; c.wa = tmp.ang;
      const k = Math.floor(tmp.x / C) + ':' + Math.floor(tmp.y / C);
      let l = out.get(k); if (!l) { l = []; out.set(k, l); } l.push(c);
    }
    for (const p of this.peds) {
      if (p.alpha <= 0.01) continue;
      U.posAt(p.pts, p.cum, p.s, tmp);
      p.wx = tmp.x; p.wy = tmp.y; p.ped = true;
      const k = Math.floor(tmp.x / C) + ':' + Math.floor(tmp.y / C);
      let l = out.get(k); if (!l) { l = []; out.set(k, l); } l.push(p);
    }
    if (road) for (const w of this.walkers) {
      if (w.alpha <= 0.01) continue;
      this.walkerWorld(w, tmp);
      w.wx = tmp.x; w.wy = tmp.y; w.ped = true;
      const k = Math.floor(tmp.x / C) + ':' + Math.floor(tmp.y / C);
      let l = out.get(k); if (!l) { l = []; out.set(k, l); } l.push(w);
    }
    return out;
  };
  Agents.prototype.drawAll = function (ctx, R, alpha) {
    const road = this.roadRef, tmp = {};
    const list = [];
    if (road) for (const c of this.cars) { if (c.alpha <= 0.01) continue; this.carWorld(c, road, tmp); c.wx = tmp.x; c.wy = tmp.y; c.wa = tmp.ang; list.push(c); }
    for (const p of this.peds) { if (p.alpha <= 0.01) continue; U.posAt(p.pts, p.cum, p.s, tmp); p.wx = tmp.x; p.wy = tmp.y; p.ped = true; list.push(p); }
    if (road) for (const w of this.walkers) { if (w.alpha <= 0.01) continue; this.walkerWorld(w, tmp); w.wx = tmp.x; w.wy = tmp.y; w.ped = true; list.push(w); }
    this.drawList(ctx, R, list, alpha);
  };
  // 车辆按车型画出长短与宽窄：公交与货车更长，自行车与摩托车细短并带骑车人；拥堵减速时亮刹车灯
  Agents.prototype.drawList = function (ctx, R, list, alpha) {
    const z = R.z, iso = R.tEase > 0.5, night = !!(R.th && R.th.night);
    const fullDetail = z >= 28 || !R.detail || R.detail.tier === 0;
    const wcar = U.clamp(z * 0.038, 1.6, 4.2), lift = iso ? 1 : 0;
    ctx.lineCap = 'round';
    const pa = {}, pb = {};
    for (const a of list) {
      const screen = R.P(a.wx, a.wy, 0, pa);
      if (screen.x < -12 || screen.y < -12 || screen.x > R.w + 12 || screen.y > R.h + 12) continue;
      ctx.globalAlpha = a.alpha * alpha;
      if (a.ped) {
        const p = R.P(a.wx, a.wy, 0, pa);
        ctx.fillStyle = a.color;
        if (iso) { ctx.fillRect(p.x - 0.8, p.y - 3.4, 1.6, 3); ctx.beginPath(); ctx.arc(p.x, p.y - 4.2, 1, 0, Math.PI * 2); ctx.fill(); }
        else ctx.fillRect(p.x - 1, p.y - 1, 2, 2);
        continue;
      }
      const dim = VDIM[a.kind] || VDIM.car, Lc = dim[0], w = Math.max(1, wcar * dim[1]);
      const cx = Math.cos(a.wa) * Lc / 2, cy = Math.sin(a.wa) * Lc / 2;
      R.P(a.wx + cx, a.wy + cy, 0, pa); R.P(a.wx - cx, a.wy - cy, 0, pb);
      const two = a.kind === 'bike' || a.kind === 'moto';
      if (iso && !two) {
        ctx.strokeStyle = 'rgba(40,40,50,0.25)'; ctx.lineWidth = w + 1;
        ctx.beginPath(); ctx.moveTo(pb.x, pb.y + 1); ctx.lineTo(pa.x, pa.y + 1); ctx.stroke();
      }
      ctx.strokeStyle = a.color; ctx.lineWidth = w;
      ctx.beginPath(); ctx.moveTo(pb.x, pb.y - lift); ctx.lineTo(pa.x, pa.y - lift); ctx.stroke();
      if (two) {
        // 骑车人
        if (z > 22) { ctx.fillStyle = a.rider || '#4a5568'; ctx.beginPath(); ctx.arc((pa.x + pb.x) / 2, (pa.y + pb.y) / 2 - lift - (iso ? 1.6 : 0), Math.max(0.9, w * 0.75), 0, Math.PI * 2); ctx.fill(); }
        if (fullDetail && night && z > 18 && a.kind === 'moto') { ctx.fillStyle = 'rgba(255,244,200,0.95)'; ctx.beginPath(); ctx.arc(pa.x, pa.y - lift, 0.9, 0, Math.PI * 2); ctx.fill(); }
        continue;
      }
      if (z > 30) {
        const mx = (pa.x + pb.x) / 2, my = (pa.y + pb.y) / 2;
        if (a.kind === 'bus') { ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = w * 0.35; ctx.beginPath(); ctx.moveTo(pb.x * 0.85 + pa.x * 0.15, pb.y * 0.85 + pa.y * 0.15 - lift); ctx.lineTo(pa.x * 0.85 + pb.x * 0.15, pa.y * 0.85 + pb.y * 0.15 - lift); ctx.stroke(); }
        else if (a.kind === 'truck') { ctx.strokeStyle = 'rgba(235,238,242,0.9)'; ctx.lineWidth = w * 0.9; ctx.beginPath(); ctx.moveTo(pb.x, pb.y - lift); ctx.lineTo(mx * 0.3 + pb.x * 0.7 + (pa.x - pb.x) * 0.45, my * 0.3 + pb.y * 0.7 + (pa.y - pb.y) * 0.45 - lift); ctx.stroke(); }
        else { ctx.strokeStyle = 'rgba(30,40,60,0.45)'; ctx.lineWidth = w * 0.5; ctx.beginPath(); ctx.moveTo(mx, my - lift); ctx.lineTo(pa.x * 0.7 + mx * 0.3, pa.y * 0.7 + my * 0.3 - lift); ctx.stroke(); }
        if (a.kind === 'taxi') { ctx.fillStyle = '#fff6c8'; ctx.beginPath(); ctx.arc(mx, my - lift, Math.max(0.7, w * 0.22), 0, Math.PI * 2); ctx.fill(); }
      }
      if (fullDetail && z > 14 && (night || (a.brake && z > 30))) {
        // 车灯：夜间前白后红；减速排队时尾灯更亮
        const rr = Math.max(0.9, w * 0.38);
        if (night) { ctx.fillStyle = 'rgba(255,244,200,0.95)'; ctx.beginPath(); ctx.arc(pa.x, pa.y - lift, rr, 0, Math.PI * 2); ctx.fill(); }
        ctx.fillStyle = a.brake ? 'rgba(255,40,40,1)' : 'rgba(255,70,60,0.9)'; ctx.beginPath(); ctx.arc(pb.x, pb.y - lift, rr * (a.brake ? 1 : 0.8), 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  };
})(window.CM);
