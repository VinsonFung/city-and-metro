'use strict';
// 动态对象：列车（按发车间隔调度、加减速平滑运行）、汽车（按路段流量与车速）、行人（沿街道往返车站）
// 代表性展示：数量与模拟人口不一一对应，但与交通变化方向一致。
(function (CM) {
  const AX = CM.Accessibility;
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
  // 车辆构成（代表性展示，估算）：份额依次为 私家车、出租车、公交、货车、自行车、摩托车（巴黎另有第 7 项马车），按地区与年代插值。
  // 只决定画面上车辆的样子，数量仍由交通模型的路段流量决定。
  const VKIND = ['car', 'taxi', 'bus', 'truck', 'bike', 'moto', 'horse'];
  const MIX = {
    // 巴黎：1900 年街头以马车、马拉公共马车与自行车为主；1913 年最后一辆马拉公共马车停运，1920 年代汽车迅速普及
    eu: [[1900, [0, 0, 0.12, 0.05, 0.18, 0, 0.65]], [1910, [0.08, 0.12, 0.12, 0.08, 0.18, 0.01, 0.41]], [1925, [0.35, 0.15, 0.12, 0.15, 0.15, 0.03, 0.05]], [1935, [0.5, 0.15, 0.1, 0.15, 0.08, 0.02, 0]],
      [1950, [0.5, 0.12, 0.08, 0.18, 0.08, 0.04, 0]], [1975, [0.68, 0.08, 0.06, 0.14, 0.01, 0.03, 0]], [2007, [0.66, 0.1, 0.06, 0.1, 0.04, 0.04, 0]], [2020, [0.6, 0.1, 0.07, 0.09, 0.09, 0.05, 0]]],
    cn: [[1950, [0.06, 0.03, 0.18, 0.28, 0.45, 0]], [1990, [0.12, 0.10, 0.13, 0.17, 0.42, 0.06]], [2000, [0.32, 0.13, 0.10, 0.13, 0.24, 0.08]], [2010, [0.60, 0.12, 0.07, 0.10, 0.08, 0.03]], [2020, [0.71, 0.10, 0.06, 0.09, 0.03, 0.01]]],
    hk: [[1960, [0.34, 0.22, 0.16, 0.24, 0.01, 0.03]], [1990, [0.50, 0.20, 0.12, 0.16, 0, 0.02]], [2020, [0.58, 0.17, 0.11, 0.12, 0, 0.02]]],
    tw: [[1980, [0.28, 0.10, 0.06, 0.12, 0.04, 0.40]], [2000, [0.36, 0.10, 0.05, 0.10, 0.02, 0.37]], [2020, [0.44, 0.08, 0.05, 0.09, 0.03, 0.31]]],
    jp: [[1950, [0.10, 0.18, 0.16, 0.38, 0.12, 0.06]], [1965, [0.34, 0.18, 0.10, 0.30, 0.05, 0.03]], [1990, [0.62, 0.12, 0.06, 0.18, 0.01, 0.01]], [2020, [0.70, 0.10, 0.05, 0.14, 0.01, 0]]],
  };
  const REGION_KEY = { '中国内地': 'cn', '中国香港': 'hk', '中国台湾': 'tw', '日本': 'jp', '法国': 'eu', '英国': 'eu' };
  const VCOL = {
    taxi: { cn: ['#c8372d', '#e8b62c', '#2f7fd0'], hk: ['#d0312d', '#d0312d', '#3a9a4a'], tw: ['#f1c232'], jp: ['#2f7a4f', '#f0c419', '#1f2a44', '#e8e8e8'], eu: ['#2d3748', '#1f2a44', '#c8ccd2'] },
    bus: { cn: ['#2e7bd1', '#3a9a5a', '#e0b13a'], hk: ['#c8102e', '#e8d9a8', '#f3c300'], tw: ['#2f6fb6', '#e04a3a'], jp: ['#3a8f4e', '#e8e0c8', '#2e6eb5'], eu: ['#3e7d5a', '#e8e0c8', '#2f8f6a'] },
    horse: ['#2d2a26', '#3a3128', '#5a3e2b', '#22303a'],
    truck: ['#3b6ea8', '#4e8a52', '#c4c9cf', '#9b5a3a'],
    bike: ['#2d3748', '#4a5568', '#2b6cb0', '#9b2c2c'],
    moto: ['#c53030', '#2b6cb0', '#e2e8f0', '#2d3748', '#d69e2e'],
    // 有轨电车（背景交通，v2.2）：巴黎早期电车、东京都电、香港电车
    tram: { eu: ['#3e6b4f', '#7a2e2a', '#c9a227'], jp: ['#d9b83f', '#3f7a56', '#c2553a'], hk: ['#2e6b3a', '#b23a2a', '#2a5a8a'], cn: ['#3e6b4f'], tw: ['#3e6b4f'] },
  };
  // 车型尺寸（世界单位长度、宽度倍数）与限速（km/h）
  const VDIM = { car: [0.085, 1, 999], taxi: [0.085, 1, 999], bus: [0.15, 1.3, 60], truck: [0.12, 1.15, 70], bike: [0.03, 0.45, 16], moto: [0.04, 0.55, 45], horse: [0.07, 0.95, 12], tram: [0.17, 1.3, 25] };
  const HORSE_KMH = 12;   // 马拉公共马车与出租马车的速度上限
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
    this.cars = []; this.carIndex = new Map(); this.carOrder = []; this.carMoves = []; this.carMoveStamp = 0;
    this.peds = []; this.walkers = [];
    this.netRef = null;
    this.treeMaps = new Map();
    this.seq = 0;
    this.fillPending = true;
  }
  CM.Agents = Agents;

  // fillPending：读档、新开局或返回游戏后的第一次同步，按发车间隔把列车铺满全线（立即呈现稳定运行状态）
  Agents.prototype.reset = function () { this.groups.clear(); this.trains = []; this.cars = []; this.carIndex.clear(); this.carOrder.length = this.carMoves.length = 0; this.peds = []; this.walkers = []; this.netRef = null; this.treeMaps.clear(); this.carBuckets = null; this.visibleRoads = null; this.roadRef = null; this.carPaths = new WeakMap(); this.roadEnds = null; this.screenRoads = null; this.crossings = null; this.tunCity = null; this.fillPending = true; this.linkInfo = null; this.carSpawnClock=this.pedSpawnClock=this.walkSpawnClock=0;this.trafficSample=null;this.turnCache=null; };

  Agents.prototype.update = function (dt, game, R) {
    const dtv = dt * game.visualRate() * CFG.time.visualPerSec;
    this.vt += dtv;
    const model = game.model;
    const W = model.weights(game.clock.minute);
    this.W = W;
    if (model.net !== this.netRef) this.syncNetwork(model.net);
    this.updateTrains(dtv, dt, model, W);
    if (CM.BgTransit) CM.BgTransit.update(dt, game);   // 背景交通的列车与渡轮（只用于画面）
    if (!R.view) return;
    // Share the same animation delta as trains and the web edition: 1x / 3x / 8x (24x clock still animates at 8x).
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
  // 车队（v2.5）：新发出的列车按所在交路的配属列车轮流取车型与编组（外观与车厢数），没有车队时沿用线路编组与年代外观
  Agents.prototype.dress = function (t, model) {
    const pl = model && model.fleetOf ? model.fleetOf(this.netRef) : null, fp = pl && pl[t.g.r];
    if (!fp) return t;
    const us = fp.units[t.g.rt.loop ? t.g.dir : 0]; if (!us || !us.length) return t;
    const u = us[(t.id * 7) % us.length]; t.mdl = u.m; t.cars = Math.min(u.cars, t.g.rt.cars);
    return t;
  };
  // 按发车间隔 h 沿整个周转铺满一组列车（第 i 列在 i·h 之前从起点发车）
  Agents.prototype.fillGroup = function (g, h, alpha, model) {
    const need = Math.max(1, Math.ceil(g.cycle / h));
    for (let i = 0; i < need; i++) {
      let off = i * h, leg = 0;
      while (leg < g.legs.length && off >= g.legs[leg].T + g.legs[leg].dwell) { off -= g.legs[leg].T + g.legs[leg].dwell; leg++; }
      if (leg >= g.legs.length) break;
      this.trains.push(this.dress({ id: ++this.seq, g: g, gkey: g.key, leg: leg, t: off, alpha: alpha, dying: false, held: false }, model));
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
        const f = model.freqAt(g.r, W, g.rt.loop ? g.dir : null);   // 环线两个方向的列车数可以不同（v2.5）
        g.h = f > 0.1 ? 3600 / f : Infinity;
        g.need = isFinite(g.h) ? Math.max(1, Math.ceil(g.cycle / g.h)) : 0;
        if ((fill || g.refill) && isFinite(g.h) && g.count === 0) { this.fillGroup(g, g.h, fill ? 1 : 0, model); return; }
        g.refill = false;
        if (g.count < g.need && vt >= g.lastDep + g.h) {
          this.trains.push(this.dress({ id: ++this.seq, g: g, gkey: g.key, leg: 0, t: 0, alpha: 0, dying: false, held: false }, model));
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
    const g = t.g, L = g.legs[t.leg];
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
    const Lt = Math.max(CAR_M * (t.cars || rt.cars) / CFG.CELL_M, 0.12), dir = pos.fwd ? 1 : -1;
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
    const f = model.freqAt(t.g.r, W, t.g.rt.loop ? (L.rev ? 1 : 0) : null);
    return f > 0 ? model.edgeLoadAt(re[2 * L.k + (L.rev ? 1 : 0)], W) / (f * model.capOf(t.g.r, net)) : 0;
  };
  // 两种视图共用外观、门位及上下车动作；这些对象不进入存档或交通求解。
  Agents.DOOR_FRACTIONS = [0.3, 0.7];
  Agents.CAR_M = CAR_M; Agents.GAP_M = GAP_M;
  // 年代外观（v2.3）：列车与站台按年代换代，2D、3D 与站台模型共用。
  // 列车按「线路开通年份」与「当前年份 − 25 年（车队更新）」中较晚者取年代，站台按「建成年份」与「当前年份 − 40 年（翻新）」中较晚者：
  // early 早期木质 / 铆接车厢（1900–1939）· classic 战后涂装车（1940–1974）· modern 不锈钢通勤车（1975–2004）· current 现代全涂装（2005–2034）· future 未来流线型（2035 起）
  const ERA_STEPS = [[1940, 'early'], [1975, 'classic'], [2005, 'modern'], [2035, 'current']];
  Agents.eraOf = function (y) { for (const s of ERA_STEPS) if (y < s[0]) return s[1]; return 'future'; };
  const lineYears = new WeakMap();   // 按线网对象缓存（不写进线网，避免进入存档）
  Agents.lineBuiltYear = function (net, lid) {
    if (!net) return 0; let memo = lineYears.get(net); if (!memo) lineYears.set(net, memo = {}); if (memo[lid] != null) return memo[lid];
    let y = 1e9; for (const id in net.segments) { const s = net.segments[id]; if (s.line === lid && s.built) y = Math.min(y, s.built[0]); }
    return (memo[lid] = y < 1e9 ? y : 0);
  };
  Agents.trainEra = function (R, lid) {
    const g = R.game, y = g && g.clock ? g.clock.y : 2000, built = g && g.net ? Agents.lineBuiltYear(g.net, lid) : 0;
    return Agents.eraOf(Math.max(built || y, y - 25));
  };
  // 车身、窗带、腰线与车顶的颜色：早期深色清漆车身配线路色腰线，战后整车涂装配奶白窗带，不锈钢车配线路色色带，未来车为白色车身配发光色带
  Agents.ERA_TRAIN = {
    early: { body: '#5a2e24', band: 'line', roof: '#3a3634', win: '#f4d9a2', ends: 'square', w: 0.86 },
    classic: { body: 'line', band: '#efe6cc', roof: '#4d5257', win: '#fff3d6', ends: 'round', w: 0.94 },
    modern: { body: '#c4ccd4', band: 'line', roof: '#9aa3ad', win: '#ffffff', ends: 'square', w: 1 },
    current: { body: 'line', band: '#26303b', roof: 'line', win: '#ffffff', ends: 'round', w: 1 },
    future: { body: '#f1f4f7', band: 'line', roof: '#e3e8ee', win: '#d8f2ff', ends: 'pointed', w: 1, glow: true },
  };
  Agents.prototype.trainLook = function (t, R, lf) {
    const rt=t.g.rt,line=R.drawnC?.net.lines[rt.lineId]||R.game?.net.lines[rt.lineId]||rt.line||{id:rt.lineId,color:rt.color};
    const color=AX.line(line),night=!!R.th.night,year=R.game&&R.game.clock?R.game.clock.y:0;
    let lk=t._look;
    if(!lk||lk.color!==color||lk.night!==night||lk.year!==year||lk.mdl!==t.mdl){
      // 车队的车型外观（v2.5）优先：式样与配色按车型（'line' 用线路色），没有车型时按线路年代
      const ml=t.mdl&&t.mdl.look,era=ml?ml.era:Agents.trainEra(R,rt.lineId),E=ml?Object.assign({},Agents.ERA_TRAIN[ml.era],ml):Agents.ERA_TRAIN[era],pick=function(c){return c==='line'?color:c;};
      lk=t._look={color:color,era:era,body:pick(E.body),band:pick(E.band),roof:pick(E.roof),ends:E.ends,wf:E.w,glow:!!E.glow,win:E.win,window:E.win,door:night?'#ffecaa':'#fffceb',night:night,year:year,mdl:t.mdl};
    }
    lk.window=night?'#ffe496':lf>1?'#ffc8c8':lk.win;
    return lk;
  };
  Agents.prototype.trainRiders = function (t, ph, nCar, model, W, out) {
    out=out||[];out.length=0;const L=t.g.legs[t.leg];if(!L||ph.door<=0||nCar<=1)return out;
    const next=ph.state==='hold'?L:t.g.legs[(t.leg+1)%t.g.legs.length],nA=ph.state==='dwell'?paxCount(this.legLoad(t,L,model,W)):0,nB=paxCount(this.legLoad(t,next,model,W)),stop=t.id*131+t.leg*17,pal=this.pal||PED_COLORS;
    for(let j=0;j<nA+nB;j++){
      const board=j>=nA,jj=board?j-nA:j,p=board?1-(ph.until-(DOOR.closeLead+.4+jj*DOOR.gap))/DOOR.walk:(ph.since-(DOOR.delay+DOOR.open*.5+jj*DOOR.gap))/DOOR.walk;
      if(p<=0||p>=1)continue;
      out.push({car:Math.floor(U.hash2(stop,j,5)*nCar),f:Agents.DOOR_FRACTIONS[U.hash2(stop,j,6)<.5?0:1],side:U.hash2(stop,j,7)<.5?-1:1,spread:U.hash2(stop,j,8)-.5,board,p,u:U.smooth(p),alpha:Math.min(1,(board?1-p:p)*4+.25)*Math.min(1,(board?p:1-p)*6),color:pal[(U.hash2(stop,j,9)*pal.length)|0]});
    }return out;
  };
  Agents.prototype.drawTrains = function (ctx, R, ui) {
    const net = this.netRef; if (!net) return;
    const z = R.z, under = U.smooth(R.cam.under), game = R.game;
    const model = game && !game.preview ? game.model : null;
    const W = this.W;
    const tmp = {}, sp = {}, ph = {}, q = {};
    const width = U.clamp(z * 0.075, 2.4, 7.5);
    const v = R.view, hl = ui && ui.highlightLine, night = !!(R.th && R.th.night);
    const tier = R.detail ? R.detail.tier : 0, carLen = CAR_M / CFG.CELL_M, carGap = GAP_M / CFG.CELL_M;
    const showWin = z >= 22, showDoor = z >= 30, showPax = z >= 30 && tier < 2 && (!game || game.speed <= 2);
    let paxBudget = Math.round(CFG.perf.maxRiders * (tier === 1 ? 0.5 : 1));
    const UD = CM.RENDER_CONST.UNDER_DEPTH;
    const joints = this._joints || (this._joints = []), batch = new Map();
    const trainList=R.follow?[R.follow,...this.trains.filter(t=>t!==R.follow)]:this.trains;
    for (const t of trainList) {
      if (!t.g || t.alpha <= 0.01) continue;
      const rt = t.g.rt;
      this.trainPos(t, tmp);
      U.posAt(rt.pts, rt.cum, tmp.d, q);
      if (R.follow !== t && (q.x < v.x0 - 1 || q.x > v.x1 + 1 || q.y < v.y0 - 1 || q.y > v.y1 + 1)) continue;
      this.trainSpan(t, tmp, sp);
      const off = 0.055 * sp.dir;
      // 车厢接缝的屏幕坐标：沿实际轨道曲线取点，转弯时各节车厢分别转向
      const allCars = z >= 14, nCar = allCars ? (t.cars || rt.cars) : 1, step = allCars ? carLen : sp.Lt;
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
      if(!t.pickPath||t.pickPath.length!==(nCar+1)*2)t.pickPath=new Float32Array((nCar+1)*2);
      for(let k=0;k<=nCar;k++){t.pickPath[k*2]=joints[k].x;t.pickPath[k*2+1]=joints[k].y;}
      let alpha = t.alpha;
      const seg = rt.segRefs[tmp.k], cs = net.C.segs.get(seg.id);
      const segType = cs ? cs.seg.type : 'underground';
      t.segType = segType; t.hh = head.h;
      if (head.h < -0.01) alpha *= U.lerp(0.55, 1, under);
      else if (under > 0) alpha *= U.lerp(1, 0.4, under);
      if (hl && hl !== rt.lineId) alpha *= 0.3;
      ctx.globalAlpha = alpha;
      this.phase(t,t.animation||(t.animation={}));Object.assign(ph,t.animation);t.door=ph.door;t.state=ph.state;
      const L=t.g.legs[t.leg],lf=z>=14&&L?this.legLoad(t,L,model,W):0,look=this.trainLook(t,R,lf);
      const riders=t.riders||(t.riders=[]);riders.length=0;
      if(showPax&&paxBudget>0)this.trainRiders(t,ph,nCar,model,W,riders);
      if(riders.length>paxBudget)riders.length=paxBudget;paxBudget-=riders.length;t.riderFrame=R.frame;
      // 跟随中的列车：脉动圆环
      if (R.follow === t) {
        const pr = 0.5 + 0.5 * Math.sin(R.time * 5), rr = Math.max(9, Math.hypot(head.x - tail.x, head.y - tail.y) / 2 + 6);
        ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(t.sx, t.sy, rr + pr * 3, 0, Math.PI * 2); ctx.stroke();
        ctx.strokeStyle = look.color; ctx.lineWidth = 2.2; ctx.stroke();
      }
      if (z < 7) {
        ctx.fillStyle = look.color; ctx.beginPath(); ctx.arc(head.x, head.y, 2.6, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; ctx.stroke();
        continue;
      }
      if (z < 14 && nCar === 1 && R.follow !== t && !(look.glow && night)) {
        const wb = width * (look.wf || 1), ed = look.era === 'current' ? look.color : look.band, key = ed + '|' + look.body + '|' + wb + '|' + Math.round(alpha * 8);
        let b = batch.get(key);
        if (!b) { b = { edge: ed, body: look.body, w: wb, a: Math.round(alpha * 8) / 8, p: [] }; batch.set(key, b); }
        b.p.push(tail.x, tail.y, head.x, head.y);
        t.door = ph.door; t.state = ph.state;
        continue;
      }
      // 车体：外廓 + 线路色；近景各节车厢分开画（接缝留空）
      const gapPx = nCar > 1 ? Math.min(0.5, carGap / carLen) : 0;
      const carPath = function (k) {
        const a = joints[k], b = joints[k + 1], g0 = k > 0 ? gapPx / 2 : 0, g1 = k < nCar - 1 ? gapPx / 2 : 0;
        ctx.moveTo(a.x + (b.x - a.x) * g0, a.y + (b.y - a.y) * g0); ctx.lineTo(b.x + (a.x - b.x) * g1, b.y + (a.y - b.y) * g1);
      };
      ctx.lineCap = nCar > 1 ? 'butt' : 'round';
      // 年代外观（v2.3）：外缘为腰线 / 色带颜色，内部为车身颜色；端部按年代为方头、圆头或流线尖头；未来车夜间色带微微发光
      const wB = width * (look.wf || 1), edge = look.era === 'current' ? look.color : look.band;
      ctx.strokeStyle = 'rgba(20,24,30,0.55)'; ctx.lineWidth = wB + 2;
      ctx.beginPath(); for (let k = 0; k < nCar; k++) carPath(k); ctx.stroke();
      if (look.glow && night) { ctx.shadowColor = look.color; ctx.shadowBlur = wB * 1.6; }
      ctx.strokeStyle = edge; ctx.lineWidth = wB;
      ctx.beginPath(); for (let k = 0; k < nCar; k++) carPath(k); ctx.stroke();
      ctx.shadowBlur = 0;
      if (edge !== look.body && z >= 9) { ctx.strokeStyle = look.body; ctx.lineWidth = wB * 0.66; ctx.beginPath(); for (let k = 0; k < nCar; k++) carPath(k); ctx.stroke(); }
      if (nCar > 1 && look.ends !== 'square') {
        ctx.fillStyle = edge;
        if (look.ends === 'pointed') {
          // 流线车头：沿行进方向收成尖头；车尾仍为圆端
          const hx0 = head.x - joints[1].x, hy0 = head.y - joints[1].y, hl0 = Math.hypot(hx0, hy0) || 1, ux0 = hx0 / hl0, uy0 = hy0 / hl0;
          ctx.beginPath(); ctx.moveTo(head.x + uy0 * wB / 2, head.y - ux0 * wB / 2); ctx.lineTo(head.x + ux0 * wB * 1.1, head.y + uy0 * wB * 1.1); ctx.lineTo(head.x - uy0 * wB / 2, head.y + ux0 * wB / 2); ctx.fill();
          ctx.beginPath(); ctx.arc(tail.x, tail.y, wB / 2, 0, Math.PI * 2); ctx.fill();
        } else { ctx.beginPath(); ctx.arc(head.x, head.y, wB / 2, 0, Math.PI * 2); ctx.arc(tail.x, tail.y, wB / 2, 0, Math.PI * 2); ctx.fill(); }
      }
      if (z >= 14) {
        // 车窗：夜间亮灯；过度拥挤时偏红
        ctx.strokeStyle = look.window;
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
          ctx.strokeStyle = look.door; ctx.lineWidth = Math.max(1.2, width * 0.22); ctx.lineCap = 'butt';
          ctx.beginPath();
          for (let k = 0; k < nCar; k++) {
            const a = joints[k], b = joints[k + 1], dx = b.x - a.x, dy = b.y - a.y, l = Math.hypot(dx, dy) || 1, nx = -dy / l, ny = dx / l;
            const o0 = width / 2 - 0.5, o1 = width / 2 + 0.5 + 1.6 * ph.door;
            for (const f of Agents.DOOR_FRACTIONS) { const x = a.x + dx * f, y = a.y + dy * f; for (const s of [-1, 1]) { ctx.moveTo(x + nx * o0 * s, y + ny * o0 * s); ctx.lineTo(x + nx * o1 * s, y + ny * o1 * s); } }
          }
          ctx.stroke();
        }
        // 代表性乘客：下车（按到站区间的满载率）→ 上车（按发车区间的满载率），沿门口与站台之间走动
        if (riders.length) {
          for (const rider of riders) {
            const a=joints[rider.car],b=joints[rider.car+1],f=rider.f,s=rider.side,board=rider.board;
            const dx = b.x - a.x, dy = b.y - a.y, l = Math.hypot(dx, dy) || 1, nx = -dy / l * s, ny = dx / l * s, ux2 = dx / l, uy2 = dy / l;
            const x0 = a.x + dx * f + nx * (width / 2 + 0.8), y0 = a.y + dy * f + ny * (width / 2 + 0.8);
            const spread = rider.spread * width * 3, far = width / 2 + 3 + width * 0.6;
            const x1 = a.x + dx * f + nx * far + ux2 * spread, y1 = a.y + dy * f + ny * far + uy2 * spread;
            const u = rider.u, from = board ? [x1, y1] : [x0, y0], to = board ? [x0, y0] : [x1, y1];
            ctx.globalAlpha = alpha * rider.alpha;
            ctx.fillStyle = rider.color;
            ctx.beginPath(); ctx.arc(U.lerp(from[0], to[0], u), U.lerp(from[1], to[1], u), Math.max(1, width * 0.2), 0, Math.PI * 2); ctx.fill();
          }
          ctx.globalAlpha = alpha;
        }
      }
      t.door = ph.door; t.state = ph.state;
    }
    if (batch.size) {
      const seg = function (p) { ctx.beginPath(); for (let i = 0; i < p.length; i += 4) { ctx.moveTo(p[i], p[i + 1]); ctx.lineTo(p[i + 2], p[i + 3]); } ctx.stroke(); };
      ctx.lineCap = 'round';
      for (const b of batch.values()) { ctx.globalAlpha = b.a; ctx.strokeStyle = 'rgba(20,24,30,0.55)'; ctx.lineWidth = b.w + 2; seg(b.p); }
      for (const b of batch.values()) {
        ctx.globalAlpha = b.a; ctx.strokeStyle = b.edge; ctx.lineWidth = b.w; seg(b.p);
        if (b.edge !== b.body && z >= 9) { ctx.strokeStyle = b.body; ctx.lineWidth = b.w * 0.66; seg(b.p); }
      }
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
    const dtv = dt * CFG.time.visualPerSec;
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
    this.pal = this.palette(pg.clock);
    this.updateWalkers(dtv, dt, { city: pg.city, clock: pg.clock }, R, R.agentsOn && R.z >= 22 && R.cam.under < .5);
  };

  // ---------------- 汽车 ----------------
  // 三维视野的世界包围盒远大于屏幕：动画名额优先给实际画面内的道路。
  Agents.prototype.roadOnScreen = function (R, L) {
    if (!R.P) return true;
    let cache = this.screenRoads;
    const c=R.cam,key=(R.projKey||[c.cx,c.cy,c.zoom,c.t,c.yaw,c.pitch].join(':'))+':'+R.w+':'+R.h;
    if (!cache || cache.key !== key || cache.road !== this.roadRef) cache = this.screenRoads = { key, road: this.roadRef, values: new Map() };
    if (cache.values.has(L.id)) return cache.values.get(L.id);
    let x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity;const q=this._roadScreenPt||(this._roadScreenPt={});
    for(const i of [0,L.pts.length>>1,L.pts.length-1]){const p=L.pts[i];R.P(p[0],p[1],0,q);if(!Number.isFinite(q.x+q.y))continue;x0=Math.min(x0,q.x);x1=Math.max(x1,q.x);y0=Math.min(y0,q.y);y1=Math.max(y1,q.y);}
    const on=x1>=-70&&x0<=R.w+70&&y1>=-70&&y0<=R.h+70;cache.values.set(L.id,on);return on;
  };
  Agents.prototype.updateCars = function (dtv, dt, game, R, W) {
    const model = game.model, road = model.road, city = game.city;
    const z = R.z, v = R.view;
    this.tunCity = city;
    if (this.roadRef !== road) this.syncRoad(road, city);
    const show = R.agentsOn && R.layerFade < 0.95 && z >= 7 && R.cam.under < 0.95;
    const margin = 3;
    const inView = (L) => { const b = L.bbox; return b[2] >= v.x0 - margin && b[0] <= v.x1 + margin && b[3] >= v.y0 - margin && b[1] <= v.y1 + margin ; };
    const kmh2cell = 1 / 3.6 / CFG.CELL_M;
    const idx = this.carIndex;
    // 转弯途中 s 停在弯道入口；跟车必须继续计入弯道弧长，不能把已经前进的前车误当成静止。
    // 每条车道先移动前车，再用实际空出的距离移动后车；数组复用，路口换道不打乱本帧遍历。
    const order = this.carOrder; order.length = 0;
    const orderLane=list=>{
      // Cars cannot overtake within an animation lane; membership changes invalidate ordering.
      if(list.dirty){list.sort((a,b)=>Agents.carProgress(b)-Agents.carProgress(a));list.dirty=false;}
      let front=null;
      for (let i=0;i<list.length;i++) { const c=list[i]; c.leader=front; if(!c.dead&&!c.frozen)front=c; }
    };
    idx.forEach(list => { orderLane(list); for(const c of list)order.push(c); });
    for (const c of this.cars) {
      c.age=(c.age||0)+dt;
      if (!c.frozen && !inView(road.links[c.link])) c.dying = true;
      const reveal=dtv>0||!(c.exitFade<1)?dt/.5:0;
      c.alpha = c.dying ? c.alpha-dt/.4 : Math.min(c.exitFade==null?1:c.exitFade,c.alpha+reveal);
    }
    // 把下游车辆排在汇入车辆前面，跨路段也读取本帧已腾出的车距；依赖环只访问一次。
    const moves=this.carMoves; moves.length=0; const stamp=++this.carMoveStamp;
    const schedule=c=>{
      if(!c||c.dead||c.frozen||c.moveSeen===stamp||c.moveBusy===stamp)return;
      c.moveBusy=stamp;
      if(c.leader)schedule(c.leader);
      const path=this.carLane(road.links[c.link],c.dir,c.lane);
      const look=Math.max(.65,c.v*dtv+.5*1.8/CFG.CELL_M*dtv*dtv);
      if(dtv>0&&!c.turn&&c.nextArc==null&&c.s>=path.total-look)this.prepareCarTurn(c,road,model,W);
      if(c.turn){
        let next=null,near=Infinity;
        for(const other of idx.get(2*c.turn.arc+(c.lane||0))||[]){
          if(other===c||other.dead||other.frozen)continue;
          const ahead=Agents.carProgress(other)-c.turn.exit;
          if(ahead>=-Agents.carGap(c,other)&&ahead<near){near=ahead;next=other;}
        }
        if(next)schedule(next);
      }
      c.moveSeen=stamp;moves.push(c);
    };
    if(dtv>0)for(const c of order)schedule(c);
    for (const c of moves) {
      if (c.frozen || c.dead || dtv <= 0) continue;
      const L=road.links[c.link], path=this.carLane(L,c.dir,c.lane);
      if (!c.turn && c.nextArc==null && c.s>=path.total-.65) this.prepareCarTurn(c,road,model,W);
      const vmax=c.horse?HORSE_KMH:VDIM[c.kind][2],free=Math.min(CFG.road.speed[L.cls],vmax)*kmh2cell;
      let target=Math.min(CFG.road.speed[L.cls]/Math.min(8,model.arcRatioAt(2*c.link+c.dir,W)),vmax)*kmh2cell;
      const brake=3.2/CFG.CELL_M;
      for (const corner of path.corners) if (corner.s>=c.s-.01 && corner.s-c.s<.8) target=Math.min(target,Math.sqrt(corner.v*corner.v+2*brake*Math.max(0,corner.s-c.s)));
      if (c.turn) target=Math.min(target,Math.sqrt(c.turn.v*c.turn.v+2*brake*Math.max(0,c.turn.start-c.s)));
      // 本帧更早汇入的车辆也须进入跟车判断，不能沿用它汇入前的前后车关系。
      const lane=idx.get(2*(2*c.link+c.dir)+(c.lane||0));if(lane&&lane.dirty)orderLane(lane);
      const leader=c.leader;
      let gap=leader&&leader.link===c.link&&leader.dir===c.dir&&(leader.lane||0)===(c.lane||0)&&!leader.frozen&&!leader.dead?Math.max(0,Agents.carProgress(leader)-Agents.carProgress(c)-Agents.carGap(c,leader)):Infinity;
      let leadV=leader ? leader.v||0 : 0;
      // 提前看见即将汇入车道的排队车辆，在弯道结束前减速，而不是到了接缝再强制刹停。
      if(c.turn){
        const turn=c.turn,remaining=(turn.active?0:Math.max(0,turn.start-c.s))+turn.total-(turn.active?turn.distance:0);
        for(const other of idx.get(2*turn.arc+(c.lane||0))||[]){
          if(other===c||other.frozen||other.dead)continue;
          const headway=Agents.carGap(c,other),ahead=Agents.carProgress(other)-turn.exit;
          if(ahead < -headway)continue;
          const available=Math.max(0,remaining+ahead-headway);
          if(available<gap){gap=available;leadV=other.v||0;}
        }
      }
      if (Number.isFinite(gap)) target=Math.min(target,Math.sqrt(Math.max(0,leadV*leadV+2*brake*gap)));
      const oldV=c.v,rate=(target<c.v?3.2:1.8)/CFG.CELL_M;
      c.v+=U.clamp(target-c.v,-rate*dtv,rate*dtv);
      const distance=Math.min((oldV+c.v)*.5*dtv,gap);
      if (distance<oldV*dtv*.3) c.v=Math.min(c.v,distance/Math.max(1e-6,dtv));
      c.brake=c.v<free*.45;
      this.advanceCar(c,Math.max(0,distance),road,model,W);
      const current=road.links[c.link],currentPath=this.carLane(current,c.dir,c.lane),len=current.cum[current.cum.length-1],d=c.s/currentPath.total*len,ss=c.dir?len-d:d;
      // 无后续可通行道路时，在仍然行驶中淡出；不能在片段末端停车并阻塞整条展示车流。
      if(c.nextArc===-1&&!c.turn){
        const fade=Math.max(.12,Math.min(currentPath.total*.6,Math.max(c.v,free)*dtv/Math.max(dt,1e-6)*.35));
        c.exitFade=Math.min(c.exitFade==null?1:c.exitFade,Math.max(0,currentPath.total-c.s)/fade);
        c.alpha=Math.min(c.alpha,c.exitFade);
      }
      const pose=c.turn&&c.turn.active?this.pathAt(c.turn,c.turn.distance,{}):this.pathAt(currentPath,c.s,{});
      c.heading=c.heading==null?pose.a:c.heading+Math.atan2(Math.sin(pose.a-c.heading),Math.cos(pose.a-c.heading))*(1-Math.exp(-dt*16));
      const spans=this.tunnelSpans(current),inTunnel=spans&&spans.some(p=>ss>=p[0]&&ss<=p[1]);
      c.tunA=c.tunA==null?(inTunnel?TUN_ALPHA:1):U.lerp(c.tunA,inTunnel?TUN_ALPHA:1,1-Math.exp(-dt*8));
    }
    // 清理
    if (this.cars.some(function (c) { return c.dead || c.alpha <= 0; })) {
      const keep = [];
      for (const c of this.cars) { if (c.dead || (c.dying && c.alpha <= 0)) this.idxRemove(c); else keep.push(c); }
      this.cars = keep;
    }
    if (!show) { for (const c of this.cars) c.dying = true; return; }
    this.carSpawnClock=(this.carSpawnClock||0)+dt;
    if(this.visibleRoads&&this.carSpawnClock<.2)return;
    this.carSpawnClock=0;
    // 生成：数量按路段流量；车型按地区与年代的构成，并随路边用地（商业区多出租车与公交、工业区多货车）与时段调整
    const clock = game.clock || { y: 2000, minute: 600 }, hr = Math.floor(clock.minute / 60) % 24, rk = regionKey();
    const mixKey = rk + ':' + clock.y;
    if (this.mixKey !== mixKey) {
      this.mixKey = mixKey; this.mix = interpMix(MIX[rk], clock.y); this.oldCars = clock.y < 1970;
      // 巴黎：1913 年以前的公共马车、1912 年以前的出租车（fiacre）多为马拉
      this.horseBus = rk === 'eu' && clock.y < 1913; this.horseTaxi = rk === 'eu' && clock.y < 1912;
      // 有轨电车（背景交通可视化，v2.2）：DATA.bgViz.tram 给出各年份干道上电车的比例与运行的片区（缺省为全图）
      const tv = CM.DATA.bgViz && CM.DATA.bgViz.tram;
      this.tramP = tv ? Math.max(0, U.interp(tv.p, clock.y)) : 0;
      this.tramRegions = tv && tv.regions ? new Set(tv.regions) : null;
    }
    // 电车只在干道上、指定片区内出现，由一部分公交或汽车换成
    const tramOk = (L) => {
      if (!(this.tramP > 0) || L.cls < 2) return false;
      if (!this.tramRegions) return true;
      const m = L.pts[L.pts.length >> 1], c = Math.floor(m[1]) * city.W + Math.floor(m[0]), rg = city.regions[city.region[c]];
      return !!rg && this.tramRegions.has(rg.id);
    };
    const night = hr < 6 || hr >= 22, peak = (hr >= 7 && hr < 9) || (hr >= 17 && hr < 19);
    const kindFor = (L) => {
      const info = this.linkLU(L, city), w = this.mix, n = w.length, mod = [1, 1, 1, 1, 1, 1, 1];
      if (info === LU_COM) { mod[1] = 1.9; mod[2] = 1.3; mod[3] = 0.6; }
      else if (info === LU_IND) { mod[3] = 2.6; mod[1] = 0.5; }
      if (L.cls === 4) { mod[4] = 0; mod[5] *= 0.3; mod[3] *= 1.4; mod[6] = 0; }
      if (night) { mod[2] *= 0.45; mod[4] *= 0.35; mod[3] *= 1.3; mod[6] *= 0.3; } else if (peak) { mod[4] *= 1.2; mod[2] *= 1.2; }
      let tot = 0; for (let k = 0; k < n; k++) tot += w[k] * mod[k];
      let r = Math.random() * tot;
      let kind = 'car';
      for (let k = 0; k < n; k++) { r -= w[k] * mod[k]; if (r <= 0) { kind = VKIND[k]; break; } }
      if ((kind === 'bus' || kind === 'car' || kind === 'horse') && tramOk(L) && Math.random() < this.tramP) return 'tram';
      return kind;
    };
    const colorFor = (kind) => {
      if (kind === 'tram') return pick(VCOL.tram[rk] || VCOL.tram.eu);
      if (kind === 'taxi' && this.horseTaxi) return pick(VCOL.horse);
      if (CM.mapId === 'ld' && kind === 'bus') return '#c8102e';   // 伦敦的红色巴士
      if (CM.mapId === 'ld' && kind === 'taxi') return '#23272e';  // 伦敦的黑色出租车
      if (kind === 'taxi' || kind === 'bus') return pick(VCOL[kind][rk] || VCOL[kind].cn);
      if (kind === 'car') return pick(this.oldCars ? CAR_COLORS_OLD : CAR_COLORS);
      return pick(VCOL[kind]);
    };
    const vis = 0.09 * U.clamp(z / 22, 0.25, 1.2);
    let budget = 60;
    const density = !R.detail || z >= 28 ? 1 : (R.detail.tier === 2 ? 0.55 : R.detail.tier === 1 ? 0.8 : 1);
    const maxCars = Math.round(CFG.perf.maxCars * density);
    let activeCars=0;for(const c of this.cars)if(!c.dying&&++activeCars>maxCars&&c.age>18)c.retire=true;
    let total = this.cars.length;
    const step = this.frameFlip = !this.frameFlip;
    const bk = this.carBuckets, viewKey = [Math.floor((v.x0 - margin) / bk.tile), Math.floor((v.y0 - margin) / bk.tile), Math.floor((v.x1 + margin) / bk.tile), Math.floor((v.y1 + margin) / bk.tile)].join(':');
    if (!this.visibleRoads || this.visibleRoads.key !== viewKey) this.visibleRoads = { key: viewKey, ids: CM.Geo.query(bk, v.x0 - margin, v.y0 - margin, v.x1 + margin, v.y1 + margin).sort(function (a, b) { return a - b; }) };
    const ids=this.visibleRoads.ids,start=(this.carStart=((this.carStart||0)+37)%Math.max(1,ids.length));
    // 同一视野保持抽样比例，真实流量下降时不立即补满全局动画名额。
    let wanted=0;
    for(const id of ids){const L=road.links[id];if(L.cls<2||!L.real||!inView(L))continue;for(let dir=0;dir<2;dir++){const a=2*id+dir,vol=model.arcVolAt(a,W),sp=CFG.road.speed[L.cls]/Math.min(8,model.arcRatioAt(a,W));wanted+=Math.min(L.lenM/1000*30,vol/sp*L.lenM/1000*vis)*density;}}
    const sampleKey=(city.uid||CM.mapId)+':'+viewKey+':'+Math.round(z/3)+':'+(R.detail?R.detail.tier:0)+':'+(W?W.p0+':'+W.p1:'preview');
    if(!this.trafficSample||this.trafficSample.key!==sampleKey)this.trafficSample={key:sampleKey,rate:Math.min(1,maxCars*.9/Math.max(1,wanted))};
    else if(wanted*this.trafficSample.rate>maxCars*1.1)this.trafficSample.rate=maxCars*.9/wanted;

    for (let k=0;k<ids.length;k++) {
      const id=ids[(start+k)%ids.length];
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
        const target = Math.min(lenKm * 30, vol / sp * lenKm * vis) * density * this.trafficSample.rate;
        const list = idx.get(2 * a), slow = idx.get(2 * a + 1);
        const have = (list ? list.length : 0) + (slow ? slow.length : 0);
        if (have < target - 0.5 && budget > 0 && total < maxCars) {
          const kind = kindFor(L), lane = kind === 'bike' || kind === 'moto' ? 1 : 0, len = this.carLane(L,dir,lane).total;
          const s = Math.random() * Math.max(0,len-Math.min(.13,len*.28)), same = lane ? slow : list;
          let ok = true;
          if (same) for (const o of same) if (Math.abs(o.s - s) < Agents.carGap({kind},o)) { ok = false; break; }
          if (ok) {
            const horse = kind === 'horse' || (kind === 'bus' && this.horseBus) || (kind === 'taxi' && this.horseTaxi);
            const c = { link: L.id, dir: dir, s: s, v: Math.min(sp, horse ? HORSE_KMH : VDIM[kind][2]) * kmh2cell, alpha: 0, kind: kind, lane: lane, color: colorFor(kind), ang: null };
            if (horse) c.horse = true;
            if (kind === 'bike' || kind === 'moto') c.rider = pick(this.pal || PED_COLORS);
            const pose=this.carWorld(c,road,{});
            if(!this.laneSafe(this.carLane(L,dir,lane),city)||!this.surfaceSafe(city,pose.x,pose.y))continue;
            this.cars.push(c); this.idxAdd(c); budget--; total++;
          }
        } else if (have > target * 1.4 + 1) {
          for (const c of (list || slow)) if (!c.dying&&c.age>18) { c.retire = true; break; }
        }
      }
    }
  };
  // 索引键：路段方向 × 车道（0 机动车道、1 路边的自行车 / 摩托车道）
  Agents.prototype.idxAdd = function (c) { const k = 2 * (2 * c.link + c.dir) + (c.lane || 0); let l = this.carIndex.get(k); if (!l) { l = []; this.carIndex.set(k, l); } l.push(c);l.dirty=true; };
  Agents.prototype.idxRemove = function (c) { const k = 2 * (2 * c.link + c.dir) + (c.lane || 0); const l = this.carIndex.get(k); if (!l) return; const i = l.indexOf(c); if (i >= 0) { l.splice(i, 1);l.dirty=true; } if (!l.length) this.carIndex.delete(k); };
  // 路段中点所在街区的用地（缓存）：用于车型构成与街道行人
  const LU = CM.LU, LU_COM = LU.COM, LU_IND = LU.IND;
  Agents.prototype.linkLU = function (L, city) {
    let m = this.linkInfo;
    if (!m || m.city !== city || m.road !== this.roadRef || m.version !== city.version) m = this.linkInfo = { city: city, road: this.roadRef, version: city.version, lu: new Map(), act: new Map() };
    let v = m.lu.get(L.id);
    if (v === undefined) { const p = L.pts[L.pts.length >> 1], c = city.cellAt(p[0], p[1]); v = c < 0 ? 0 : city.lu[c]; m.lu.set(L.id, v); m.act.set(L.id, c < 0 ? 0 : U.clamp((city.pop[c] + city.jobs[c]) / 3000, 0, 1.6)); }
    return v;
  };
  // 隧道：车辆按路名贴合真实道路；同名道路中标为隧道（flags & 2）的路段，沿线每 0.1 格取样得到该路段的隧道区间（弧长），
  // 车辆在区间内时淡出（在地下行驶），出隧道后恢复。结果缓存在路段上（路网重建时随新路段一起失效）
  const TUN_ALPHA = 0.15, TUN_NEAR = 0.12;
  Agents.prototype.tunnelSpans = function (L) {
    if (L.tun !== undefined) return L.tun;
    const Geo = CM.Geo, city = this.tunCity;
    if (this.tunRoads !== Geo.roads) {
      this.tunRoads = Geo.roads; this.tunByName = new Map();
      for (const r of Geo.roads || []) if ((r.flags & 2) && r.name) { let l = this.tunByName.get(r.name); if (!l) this.tunByName.set(r.name, l = []); l.push(r); }
    }
    const g = city && city.roadGroups && L.name ? city.roadGroups[L.name - 1] : null;
    const feats = g && g.name ? this.tunByName.get(g.name) : null;
    let spans = null;
    if (feats) {
      const len = L.cum[L.cum.length - 1], n = Math.max(2, Math.ceil(len / 0.1)), step = len / n, inT = new Uint8Array(n + 1), tmp = {};
      for (let k = 0; k <= n; k++) {
        U.posAt(L.pts, L.cum, k * step, tmp);
        for (const f of feats) {
          const b = f.bbox, p = f.p;
          if (tmp.x < b[0] - TUN_NEAR || tmp.x > b[2] + TUN_NEAR || tmp.y < b[1] - TUN_NEAR || tmp.y > b[3] + TUN_NEAR) continue;
          let hit = false;
          for (let q = 0; q + 3 < p.length; q += 2) if (U.distToSeg(tmp.x, tmp.y, p[q], p[q + 1], p[q + 2], p[q + 3]) < TUN_NEAR) { hit = true; break; }
          if (hit) { inT[k] = 1; break; }
        }
      }
      for (let k = 0; k <= n; k++) {
        if (!inT[k]) continue;
        let e = k; while (e < n && inT[e + 1]) e++;
        (spans || (spans = [])).push([k * step - step / 2, e * step + step / 2]);
        k = e;
      }
    }
    L.tun = spans;
    return spans;
  };
  // 这些参数同时供 Canvas 与 WebGL 使用，避免切视图时放大或额外补充动画对象。
  Agents.trafficStyle=function(R,kind,out={}) {
    const dim=VDIM[kind]||VDIM.car;
    out.length=dim[0];out.width=Math.max(1,U.clamp(R.z*.038,1.6,4.2)*dim[1]);
    out.personWidth=2;out.personHeight=5.2;return out;
  };
  Agents.carGap=(a,b)=>Math.max(.045,((VDIM[a.kind]||VDIM.car)[0]+(VDIM[b.kind]||VDIM.car)[0])*.5+.01);
  Agents.carProgress=c=>c.s+(c.turn&&c.turn.active?c.turn.distance:0);
  // 圆角与偏移均在世界坐标中完成，所有视图读取同一条按真实弧长计量的路径。
  Agents.prototype.smoothPath=function(src,off=0,radius=.055) {
    const shifted=src.map((p,i)=>{const a=src[Math.max(0,i-1)],b=src[Math.min(src.length-1,i+1)],ang=Math.atan2(b[1]-a[1],b[0]-a[0]);return[p[0]-Math.sin(ang)*off,p[1]+Math.cos(ang)*off];});
    const pts=[shifted[0].slice()],corners=[];
    for(let i=1;i+1<shifted.length;i++){
      const a=shifted[i-1],b=shifted[i],c=shifted[i+1],la=U.dist(...a,...b),lb=U.dist(...b,...c),r=Math.min(radius,la*.24,lb*.24),dot=((b[0]-a[0])*(c[0]-b[0])+(b[1]-a[1])*(c[1]-b[1]))/Math.max(1e-12,la*lb);
      if(r<.0001||dot>.9999){pts.push(b.slice());continue;}
      const p=[b[0]+(a[0]-b[0])*r/la,b[1]+(a[1]-b[1])*r/la],q=[b[0]+(c[0]-b[0])*r/lb,b[1]+(c[1]-b[1])*r/lb];
      pts.push(p);const at=pts.length-1;
      for(let k=1;k<=10;k++){const t=k/10,u=1-t;pts.push([u*u*p[0]+2*u*t*b[0]+t*t*q[0],u*u*p[1]+2*u*t*b[1]+t*t*q[1]]);}
      corners.push({at,r:Math.max(.004,r*.5/Math.max(.05,Math.tan(Math.acos(U.clamp(dot,-1,1))*.5)))});
    }
    pts.push(shifted[shifted.length-1].slice());const cum=U.cumLen(pts);
    return {pts,cum,total:cum[cum.length-1],corners:corners.map(c=>({s:cum[c.at],v:Math.sqrt(1.8*c.r*CFG.CELL_M)/CFG.CELL_M}))};
  };
  Agents.prototype.carLane=function(L,dir,lane){
    const cache=this.carPaths||(this.carPaths=new WeakMap());let paths=cache.get(L);if(!paths)cache.set(L,paths=[]);
    const key=2*dir+(lane||0);if(paths[key])return paths[key];
    return paths[key]=this.smoothPath(dir?L.pts.slice().reverse():L.pts,(L.cls===4?.085:L.cls===3?.06:.035)+(lane?.028:0));
  };
  Agents.prototype.pathAt=function(path,d,out){
    U.posAt(path.pts,path.cum,d,out);const a={},b={},reach=Math.min(.025,path.total*.05);
    U.posAt(path.pts,path.cum,Math.max(0,d-reach),a);U.posAt(path.pts,path.cum,Math.min(path.total,d+reach),b);
    out.ang=out.a=Math.atan2(b.y-a.y,b.x-a.x);return out;
  };
  Agents.prototype.carLaneAt=function(L,dir,lane,d,out){return this.pathAt(this.carLane(L,dir,lane),d,out);};
  Agents.prototype.syncRoad=function(road,city){
    const old=this.roadRef,keys=new Map(road.links.map(L=>[L.key,L]));this.carIndex.clear();
    for(const c of this.cars){if(c.frozen)continue;const p=this.carWorld(c,old,{}),n=old&&keys.get(old.links[c.link].key),q=n&&!c.turn?this.carLaneAt(n,c.dir,c.lane,c.s,{}):null;
      if(q&&U.dist(p.x,p.y,q.x,q.y)<.004){c.link=n.id;c.nextArc=null;c.turn=null;c.exitFade=null;this.idxAdd(c);}else{c.frozen=p;c.dying=true;}}
    for(const w of this.walkers){if(w.frozen)continue;const L=old&&old.links[w.link],n=L&&keys.get(L.key);if(n&&L.pts.length===n.pts.length&&L.pts.every((p,i)=>p[0]===n.pts[i][0]&&p[1]===n.pts[i][1]))w.link=n.id;else{w.frozen=this.walkerWorld(w,{});w.dying=true;}}
    this.roadRef=road;this.linkInfo=null;this.visibleRoads=null;this.screenRoads=null;this.turnCache=null;
    this.carBuckets=CM.Geo.buckets(road.links,8,city.W,city.H);
    // 动画路口按实际绘制端点连接，不能使用被真实道路线形吸附前的格网交点。
    this.roadEnds=new Map();const tile=.12;
    for(const L of road.links)if(L.real&&L.cls>=2)for(let dir=0;dir<2;dir++){const p=L.pts[dir?L.pts.length-1:0],key=Math.floor(p[0]/tile)+':'+Math.floor(p[1]/tile);let a=this.roadEnds.get(key);if(!a)this.roadEnds.set(key,a=[]);a.push(2*L.id+dir);}
  };
  // 水面运动必须有当前年代实际存在的桥或隧道承接，不能用直线跨过河流。
  Agents.prototype.surfaceSafe=function(city,x,y){
    const water=city.waterAt(x,y);if(!water)return true;
    let data=this.crossings;if(!data||data.city!==city||data.version!==city.roadVersion||data.terrain!==city.terrainVer){
      const roads=[];city.roadGroups.forEach((g,i)=>{if(!(g.flags&3)||!city.roadsBuilt[i])return;for(const p of g.ways)roads.push({p,bbox:CM.Geo.bbox(p)});});
      data=this.crossings={city,version:city.roadVersion,terrain:city.terrainVer,roads,index:CM.Geo.buckets(roads,4,city.W,city.H)};
    }
    const radius=.14;
    for(const i of CM.Geo.query(data.index,x-radius,y-radius,x+radius,y+radius)){const p=data.roads[i].p;for(let k=0;k+3<p.length;k+=2)if(U.distToSeg(x,y,p[k],p[k+1],p[k+2],p[k+3])<=radius)return true;}
    return false;
  };
  // Cache immutable turn geometry by incoming lane and actual terrain/road version.
  // Each vehicle owns only its chosen progress; all safety checks remain in cache construction.
  Agents.prototype.turnChoices=function(c,road){
    const city=this.tunCity;let cache=this.turnCache;
    if(!cache||cache.road!==road||cache.terrain!==city.terrainVer||cache.version!==city.roadVersion)this.turnCache=cache={road,terrain:city.terrainVer,version:city.roadVersion,items:new Map()};
    const key=2*(2*c.link+c.dir)+(c.lane||0);if(cache.items.has(key)){const hit=cache.items.get(key);cache.items.delete(key);cache.items.set(key,hit);return hit;}
    const L=road.links[c.link],path=this.carLane(L,c.dir,c.lane),end=L.pts[c.dir?0:L.pts.length-1],tile=.12,ix=Math.floor(end[0]/tile),iy=Math.floor(end[1]/tile);const choices=[];
    const arcs=new Set();const node=road.arcTo[2*c.link+c.dir];
    for(let k=road.outStart[node];k<road.outStart[node+1];k++)arcs.add(road.outArc[k]);
    for(let j=iy-1;j<=iy+1;j++)for(let i=ix-1;i<=ix+1;i++)for(const arc of this.roadEnds?.get(i+':'+j)||[])if(road.arcFrom[arc]===node)arcs.add(arc);
    for(const arc of arcs){
      const next=road.links[arc>>1];if(next===L)continue;
      if(!next.real||next.cls<2)continue;
      const ep=next.pts[arc&1?next.pts.length-1:0];if(U.dist(...end,...ep)>.16)continue;
      const np=this.carLane(next,arc&1,c.lane),entry=Math.min(.13,path.total*.28),exit=Math.min(.13,np.total*.28),start=path.total-entry;if(!this.laneSafe(np,this.tunCity))continue;
      const a=this.pathAt(path,start,{}),b=this.pathAt(np,exit,{});if(Math.cos(b.a-a.a)<-.8)continue;
      const chord=U.dist(a.x,a.y,b.x,b.y),control=Math.min(entry+exit,chord*.55),p1=[a.x+Math.cos(a.a)*control,a.y+Math.sin(a.a)*control],p2=[b.x-Math.cos(b.a)*control,b.y-Math.sin(b.a)*control],pts=[];
      for(let k=0;k<=24;k++){const t=k/24,u=1-t;pts.push([u*u*u*a.x+3*u*u*t*p1[0]+3*u*t*t*p2[0]+t*t*t*b.x,u*u*u*a.y+3*u*u*t*p1[1]+3*u*t*t*p2[1]+t*t*t*b.y]);}
      if(pts.some(p=>!this.surfaceSafe(this.tunCity,...p)))continue;
      const cum=U.cumLen(pts);let radius=Infinity;
      for(let k=1;k+1<pts.length;k++){const a=pts[k-1],b=pts[k],d=pts[k+1],ab=U.dist(...a,...b),bc=U.dist(...b,...d),ac=U.dist(...a,...d),cross=Math.abs((b[0]-a[0])*(d[1]-a[1])-(b[1]-a[1])*(d[0]-a[0]));if(cross>1e-12)radius=Math.min(radius,ab*bc*ac/(2*cross));}
      choices.push({pts,cum,total:cum[cum.length-1],start,exit,arc,distance:0,active:false,v:Math.sqrt(1.8*Math.max(.003,radius)*CFG.CELL_M)/CFG.CELL_M});
    }
    // Active cars retain their selected geometry; evicting old cache entries is safe.
    if(cache.items.size>=2048)cache.items.delete(cache.items.keys().next().value);
    cache.items.set(key,choices);return choices;
  };
  Agents.prototype.prepareCarTurn=function(c,road,model,W){
    let pick=null,total=0;
    for(const turn of this.turnChoices(c,road)){const w=model.arcVolAt(turn.arc,W)+5;total+=w;if(Math.random()*total<w)pick=turn;}
    c.turn=pick?{...pick,distance:0,active:false}:null;c.nextArc=pick?pick.arc:-1;
  };
  Agents.prototype.advanceCar=function(c,distance,road,model,W){
    for(let guard=0;distance>1e-9&&guard<64;guard++){
      const path=this.carLane(road.links[c.link],c.dir,c.lane);
      if(!c.turn&&c.nextArc==null&&c.s+distance>=path.total-.65)this.prepareCarTurn(c,road,model,W);
      const t=c.turn;
      if(t&&t.active){
        const d=Math.min(distance,t.total-t.distance);t.distance+=d;distance-=d;
        if(t.distance<t.total-1e-9)break;
        const others=this.carIndex.get(2*t.arc+(c.lane||0));
        if(others?.some(o=>!o.dying&&o!==c&&Math.abs(Agents.carProgress(o)-t.exit)<Agents.carGap(c,o))){c.v=0;break;}
        this.idxRemove(c);c.link=t.arc>>1;c.dir=t.arc&1;c.s=t.exit;c.turn=null;c.nextArc=null;
        if(c.retire&&c.age>18)c.dying=true;   // 配额退休继续沿连通道路行驶着淡出，不制造停车障碍。
        this.idxAdd(c);continue;
      }
      const stop=t?t.start:path.total,d=Math.min(distance,Math.max(0,stop-c.s));c.s+=d;distance-=d;
      if(c.s<stop-1e-9)break;
      if(t){t.active=true;continue;}
      c.dying=true;c.dead=true;c.alpha=0;c.v=0;break;
    }
  };
  Agents.prototype.carWorld=function(c,road,out){
    if(c.frozen)return Object.assign(out,c.frozen);
    const p=c.turn?.active?this.pathAt(c.turn,c.turn.distance,out):this.carLaneAt(road.links[c.link],c.dir,c.lane,c.s,out);
    if(c.heading!=null)p.ang=p.a=c.heading;return p;
  };

  // ---------------- 行人 ----------------
  Agents.prototype.treeMap = function (k, tree) {
    let entry=this.treeMaps.get(k);
    if(!entry||entry.tree!==tree){const m=new Map();for(let q=0;q<tree.verts.length;q++)m.set(tree.verts[q],q);entry={tree,map:m};this.treeMaps.set(k,entry);}
    return entry.map;
  };
  Agents.prototype.updatePeds = function (dtv, dt, game, R, W) {
    const model = game.model, net = model.net, city = game.city;
    const z = R.z, v = R.view;
    const show = R.agentsOn && R.layerFade < 0.95 && z >= 18 && R.cam.under < 0.9;
    const tier=R.detail?R.detail.tier:0,maxPeds=Math.round(CFG.perf.maxPeds*(tier===2?.55:tier===1?.8:1));let activePeds=0;
    const mps2cell = 1 / CFG.CELL_M;
    this.pal = this.palette(game.clock);
    for (const p of this.peds) {
      if(!p.dying&&++activePeds>maxPeds)p.dying=true;
      p.alpha = p.dying ? p.alpha - dt / 0.4 : Math.min(1, p.alpha + dt / 0.5);
      p.s += p.v * dtv;
      if (p.s >= p.len) { p.s = p.len; p.dying = true; }
    }
    this.peds = this.peds.filter(function (p) { return !(p.dying && p.alpha <= 0); });
    this.updateWalkers(dtv, dt, game, R, show && z >= 22);
    if (!show) { for (const p of this.peds) p.dying = true; return; }
    if (!net) return;
    this.pedSpawnClock=(this.pedSpawnClock||0)+dt;if(this.pedSpawnClock<.2)return;this.pedSpawnClock=0;
    let budget = 25;
    const C = net.C, acc = net.acc;
    const counts = new Map();
    for (const p of this.peds) if (!p.dying) counts.set(p.st, (counts.get(p.st) || 0) + 1);
    let total = this.peds.length;
    for (let k = 0; k < C.stations.length && budget > 0; k++) {
      const s = C.stations[k];
      if (s.x < v.x0 || s.x > v.x1 || s.y < v.y0 || s.y > v.y1) continue;
      {const p=R.P(s.x,s.y,0);if(p.x < -100 || p.y < -100 || p.x > R.w+100 || p.y > R.h+100)continue;}
      const tree = acc.trees[k];
      if (!tree || tree.verts.length < 2) continue;
      const flow = model.stFlowAt(k, W, 'stIn') + model.stFlowAt(k, W, 'stOut');
      const target = Math.min(36, flow * 0.006 * U.clamp(z / 30, 0.5, 1.5));
      if ((counts.get(k) || 0) >= target || total >= maxPeds) continue;
      // 随机起点（步行 600 m 内）
      const m = this.treeMap(k, tree);
      let q = (Math.random() * tree.verts.length) | 0;
      if (tree.dist[q] > 650 || tree.dist[q] < 60) continue;
      // 完整回溯到本树的根；坏树或中断的路径不能用直线补到车站。
      const raw=[],seen=new Set();let vtx=tree.verts[q],complete=false;
      while(vtx>=0&&seen.size<tree.verts.length){
        if(seen.has(vtx))break;seen.add(vtx);const qi=m.get(vtx);if(qi===undefined)break;
        raw.push([city.vx[vtx],city.vy[vtx]]);vtx=tree.pred[qi];if(vtx===-1)complete=true;
      }
      if(!complete||raw.length<2)continue;
      const last=raw[raw.length-1];if(U.dist(...last,s.x,s.y)>1.5)continue;
      raw.push([s.x,s.y]);
      const path=this.smoothPath(raw,(Math.random()-.5)*.016,.025),pts=path.pts;
      if(!this.pathSafe(city,pts))continue;
      const inbound = Math.random() < (model.stFlowAt(k, W, 'stIn') + 1) / (flow + 2);
      if (!inbound) pts.reverse();
      const cum = U.cumLen(pts);
      const len = cum[cum.length - 1];
      if (len < 0.2) continue;
      this.peds.push({ pts: pts, cum: cum, len: len, s: 0, v: (1.1 + Math.random() * 0.5) * mps2cell, alpha: 0, st: k, color: pick(this.pal) });
      budget--; total++;
    }
  };
  // 衣着配色：夏季明亮、冬季（东京、杭州、巴黎）深色；1970 年代以前的内地、1960 年代以前的东京与 1950 年以前的巴黎以深色为主
  Agents.prototype.palette = function (clock) {
    if (!clock) return PED_COLORS;
    const rk = regionKey(), m = clock.m, cold = CM.mapId === 'tk' || CM.mapId === 'hz' || rk === 'eu';
    if ((rk === 'cn' && clock.y < 1978) || (rk === 'jp' && clock.y < 1962) || (rk === 'eu' && clock.y < 1950)) return PED_PAL.old;
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
      w.age=(w.age||0)+dt;
      if (!w.frozen && road) {const b=road.links[w.link].bbox,v=R.view;if(b[2]<v.x0-3||b[0]>v.x1+3||b[3]<v.y0-3||b[1]>v.y1+3)w.dying=true;}
      w.alpha = w.dying ? w.alpha - dt / 0.4 : Math.min(1, w.alpha + dt / 0.5);
      if(!w.frozen&&!w.dying){w.s+=w.dir*w.v*dtv;for(let hop=0;w.s>w.len&&hop<8;hop++){const over=w.s-w.len;if(!this.continueWalker(w,road,city)){w.s=w.len;w.dying=true;break;}w.s=over;}}
    }
    if (list.some(function (w) { return w.dying && w.alpha <= 0; })) this.walkers = list.filter(function (w) { return !(w.dying && w.alpha <= 0); });
    if (!show || !road || !this.visibleRoads) { for (const w of this.walkers) w.dying = true; return; }
    this.walkSpawnClock=(this.walkSpawnClock||0)+dt;if(this.walkSpawnClock<.2)return;this.walkSpawnClock=0;
    const tier = R.detail ? R.detail.tier : 0, maxW = Math.round(CFG.perf.maxWalkers * (tier === 2 ? 0.4 : tier === 1 ? 0.7 : 1));
    let active = 0;
    for (const w of this.walkers) if (!w.dying && ++active > maxW&&w.age>25) w.retire=true;
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
      if (!this.roadOnScreen(R,L)) continue;
      const mid = L.pts[L.pts.length >> 1];
      if (mid[0] < v.x0 || mid[0] > v.x1 || mid[1] < v.y0 || mid[1] > v.y1) continue;
      const lu = this.linkLU(L, city), act = this.linkInfo.act.get(L.id);
      let k = WALK_ACT[hr] * (WALK_LU[lu] || 0);
      if (lu === LU_COM && hr >= 18 && hr < 23) k *= 1.35;     // 商业区的夜间人流
      if (we) k *= lu === LU_COM ? 1.4 : (lu === LU_IND ? 0.4 : 0.9);
      const target = Math.min(5, L.lenM / 1000 * 9 * act * k * zf);
      if ((counts.get(L.id) || 0) >= target - 0.3) continue;
      const len = L.cum[L.cum.length - 1];
      const walker={ link: L.id, side: Math.random() < 0.5 ? -1 : 1, off: (L.cls === 3 ? 0.1 : 0.072) + Math.random() * 0.012, s: Math.random() * len, dir: Math.random() < 0.5 ? -1 : 1, len: len, v: (1.0 + Math.random() * 0.5) / CFG.CELL_M, alpha: 0, color: pick(this.pal) };
      walker.arcDir=walker.dir<0?1:0;walker.dir=1;
      walker.path=this.smoothPath(walker.arcDir?L.pts.slice().reverse():L.pts,walker.off,.025);walker.len=walker.path.total;walker.s=Math.min(walker.s,walker.len*.8);
      if(!this.pathSafe(city,walker.path.pts))continue;this.walkers.push(walker);
      counts.set(L.id, (counts.get(L.id) || 0) + 1);
      budget--; total++;
    }
  };
  Agents.prototype.continueWalker=function(w,road,city){
    if(w.retire&&w.age>25)return false;
    const node=road.arcTo[2*w.link+(w.arcDir||0)],a=this.pathAt(w.path,w.len,{}),choices=[];
    for(let k=road.outStart[node];k<road.outStart[node+1];k++){
      const arc=road.outArc[k],L=road.links[arc>>1];if(L.id===w.link||!L.real||L.cls<2||L.cls>3)continue;
      const path=this.smoothPath(arc&1?L.pts.slice().reverse():L.pts,w.off,.025),exit=Math.min(.1,path.total*.2),b=this.pathAt(path,exit,{});
      if(U.dist(a.x,a.y,b.x,b.y)>.35||Math.cos(b.a-a.a)<-.5||!this.laneSafe(path,city))continue;
      const control=Math.min(.12,U.dist(a.x,a.y,b.x,b.y)*.5),p=[a.x+Math.cos(a.a)*control,a.y+Math.sin(a.a)*control],q=[b.x-Math.cos(b.a)*control,b.y-Math.sin(b.a)*control],pts=[];
      for(let j=0;j<=16;j++){const t=j/16,u=1-t;pts.push([u*u*u*a.x+3*u*u*t*p[0]+3*u*t*t*q[0]+t*t*t*b.x,u*u*u*a.y+3*u*u*t*p[1]+3*u*t*t*q[1]+t*t*t*b.y]);}
      for(let j=0;j<path.pts.length;j++)if(path.cum[j]>exit)pts.push(path.pts[j]);
      if(!this.pathSafe(city,pts))continue;const cum=U.cumLen(pts);choices.push({link:L.id,arcDir:arc&1,path:{pts,cum,total:cum[cum.length-1],corners:[]}});
    }
    if(!choices.length)return false;
    const next=choices[(Math.random()*choices.length)|0];w.link=next.link;w.arcDir=next.arcDir;w.path=next.path;w.len=next.path.total;w.s=0;return true;
  };
  Agents.prototype.pathSafe=function(city,pts){
    for(let i=0;i+1<pts.length;i++){const a=pts[i],b=pts[i+1],n=Math.max(1,Math.ceil(U.dist(...a,...b)/.04));for(let k=0;k<=n;k++)if(!this.surfaceSafe(city,U.lerp(a[0],b[0],k/n),U.lerp(a[1],b[1],k/n)))return false;}
    return true;
  };
  Agents.prototype.laneSafe=function(path,city){
    if(path.safeCity!==city||path.safeRoad!==city.roadVersion||path.safeTerrain!==city.terrainVer){path.safeCity=city;path.safeRoad=city.roadVersion;path.safeTerrain=city.terrainVer;path.safe=this.pathSafe(city,path.pts);}
    return path.safe;
  };
  Agents.prototype.walkerWorld=function(w,out){
    if(w.frozen)return Object.assign(out,w.frozen);
    const p=this.pathAt(w.path,w.s,out);if(w.dir<0)p.a=p.ang+=Math.PI;return p;
  };
  Agents.prototype.actorVisible=function(R,x,y,pad=12){
    const city=R.game?.city||this.tunCity;if(city&&!this.surfaceSafe(city,x,y))return false;
    const q=R.P(x,y,0,this._actorScreen||(this._actorScreen={}));return Number.isFinite(q.x+q.y)&&q.x>=-pad&&q.y>=-pad&&q.x<=R.w+pad&&q.y<=R.h+pad;
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
  // 2D 全量绘制与 2.5D 分块绘制共用此入口，保持建筑与人车的遮挡顺序。
  Agents.prototype.drawList = function (ctx, R, list, alpha) {
    const z = R.z, iso = R.tEase > 0.5, night = !!(R.th && R.th.night), lift = iso ? 1 : 0;
    const fullDetail = z >= 28 || !R.detail || R.detail.tier === 0;
    ctx.lineCap = 'round';
    const pa = {}, pb = {};
    for (const a of list) {
      // 尚未填海成陆的海面上不画车辆与行人（道路网已不经过这里，此处防止沿真实道路线形贴合时越过岸线）
      if (!this.actorVisible(R,a.wx,a.wy)) continue;
      const screen = R.P(a.wx, a.wy, 0, pa);
      if (screen.x < -12 || screen.y < -12 || screen.x > R.w + 12 || screen.y > R.h + 12) continue;
      ctx.globalAlpha = a.alpha * alpha * (a.tunA == null ? 1 : a.tunA);
      if (a.ped) {
        const p = R.P(a.wx, a.wy, 0, pa);
        ctx.fillStyle = a.color;
        if (iso) { ctx.fillRect(p.x - 0.8, p.y - 3.4, 1.6, 3); ctx.beginPath(); ctx.arc(p.x, p.y - 4.2, 1, 0, Math.PI * 2); ctx.fill(); }
        else ctx.fillRect(p.x - 1, p.y - 1, 2, 2);
        continue;
      }
      const style=Agents.trafficStyle(R,a.kind),Lc=style.length,w=style.width;
      const cx = Math.cos(a.wa) * Lc / 2, cy = Math.sin(a.wa) * Lc / 2;
      R.P(a.wx + cx, a.wy + cy, 0, pa); R.P(a.wx - cx, a.wy - cy, 0, pb);
      const two = a.kind === 'bike' || a.kind === 'moto';
      if (iso && !two) {
        ctx.strokeStyle = 'rgba(40,40,50,0.25)'; ctx.lineWidth = w + 1;
        ctx.beginPath(); ctx.moveTo(pb.x, pb.y + 1); ctx.lineTo(pa.x, pa.y + 1); ctx.stroke();
      }
      ctx.strokeStyle = a.color; ctx.lineWidth = w;
      ctx.beginPath(); ctx.moveTo(pb.x, pb.y - lift); ctx.lineTo(pa.x, pa.y - lift); ctx.stroke();
      if (a.horse) { // 车前的马
        ctx.strokeStyle = '#7a5536'; ctx.lineWidth = Math.max(1, w * 0.5);
        ctx.beginPath(); ctx.moveTo(pa.x, pa.y - lift); ctx.lineTo(pa.x + (pa.x - pb.x) * 0.55, pa.y + (pa.y - pb.y) * 0.55 - lift); ctx.stroke();
        continue;
      }
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
