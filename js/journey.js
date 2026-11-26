'use strict';
// 出行查询（v3.4）：地铁圈的「导航」与「市民故事」共用。给定两个地点，按交通模型已发布的结果（工作日各时段的发车频率、
// 车厢拥挤、车站延误、道路拥堵）列出居民会怎么走：沿步行路网走到车站（与覆盖、接驳同一棵步行树）、候车（半个发车间隔加车站延误）、
// 乘车、换乘（站内通道或站外步行）、出站步行；并与开车（拥堵后的道路行程加停车取车）、公交（背景交通，路面公交按拥堵时间 × 慢行系数加候车）、
// 步行对比。地铁一侧的路径按方式选择模型同一套广义费用（步行与候车权重、换乘惩罚、拥挤）在地铁网络上找最短路，坐地铁的比例也用同一个 Logit 公式。
// 只读取模拟结果，不改变规则，也不参与求解。另附一个可平移缩放的小地图（总览底图 + 线网 + 路线），导航与市民主页共用。
(function (CM) {
  const U = CM.U, CFG = CM.CFG, INF = 1e30, h = U.h;
  const J = CM.Journey = {};
  // 可查询的时段（工作日）：与交通模型的四个时段一一对应
  J.PER = [['早高峰', 0], ['日间平峰', 1], ['晚高峰', 2], ['夜间', 3]];
  const vmaps = new WeakMap();
  const vmap = function (tree) { let m = vmaps.get(tree); if (!m) { m = new Map(); for (let q = 0; q < tree.verts.length; q++) m.set(tree.verts[q], q); vmaps.set(tree, m); } return m; };
  const kmOf = function (x0, y0, x1, y1) { return U.dist(x0, y0, x1, y1) * CFG.CELL_M / 1000; };

  // 交通结果是否可用：模型工作日该时段的状态（发车频率、车厢拥挤、车站延误、汽车行程表与道路拥堵；发布给界面的副本不含后几项），
  // 且与当前线网对得上（改网后重新求解的头几步暂不可用）
  J.period = function (g, k) {
    if (!g?.model?.trafficReady() || g._settlementTrafficNeedsRebuild) return null;
    const m = g && g.model; if (!m || !m.net || !m.results || !m.ctxs || !m.ctxs.wd) return null;
    const P = m.ctxs.wd.per[k || 0], net = m.net;
    if (!P || !P.freq || P.freq.length !== net.R || !P.crowd || P.crowd.length !== net.nE || !P.stDelay || P.stDelay.length !== net.N || !P.skimLay) return null;
    return P;
  };
  J.ready = function (g) { return !!J.period(g, 0); };

  // 从地点步行到附近运营车站（步行路网距离，15 分钟以内）：[{ s, m, min, v, tree }]，近的在前
  J.walkLinks = function (g, x, y, limitM) {
    const m = g.model, net = m.net, C = net.C, acc = net.acc, city = g.city, out = [];
    const c = city.cellAt(x, y); if (c < 0 || !acc || !acc.trees) return out;
    const VW = city.VW, i = c % city.W, j = (c / city.W) | 0, maxM = limitM || CFG.walk.maxAccessM, mpm = CFG.walk.mPerMin;
    const corners = [j * VW + i, j * VW + i + 1, (j + 1) * VW + i, (j + 1) * VW + i + 1];
    const JC = C.stJ && CM.Juris && CM.Juris.rules && CM.Juris.rules() ? CM.Juris.cells(city) : null, reach = (maxM + 300) / CFG.CELL_M;
    for (let k = 0; k < C.stations.length; k++) {
      const s = C.stations[k];
      if (!C.serviced[k] || Math.abs(s.x - x) > reach || Math.abs(s.y - y) > reach) continue;
      if (JC && C.stJ && JC[c] !== C.stJ[k]) continue;   // 一图两城：只能步行到本城的车站
      const tr = acc.trees[k]; if (!tr) continue;
      const M = vmap(tr); let best = INF, bv = -1;
      for (const v of corners) { const q = M.get(v); if (q === undefined) continue; const d = tr.dist[q] + U.dist(x, y, city.vx[v], city.vy[v]) * CFG.CELL_M; if (d < best) { best = d; bv = v; } }
      if (best <= maxM) out.push({ s: k, m: best, min: best / mpm, v: bv, tree: tr });
    }
    out.sort(function (a, b) { return a.m - b.m; });
    return out.slice(0, 8);
  };
  // 步行路线：地点 → 路口 → … → 车站旁的路口（沿步行树回溯）
  const walkPts = function (city, L, x, y) {
    const pts = [[x, y]], tr = L.tree, M = vmap(tr);
    let v = L.v, guard = 0;
    while (v >= 0 && guard++ < 5000) { pts.push([city.vx[v], city.vy[v]]); const q = M.get(v); if (q === undefined) break; v = tr.pred[q]; }
    return pts;
  };

  // 地铁网络各边的广义费用与实际分钟（与 Model.metroSkim 同一规则）；按线网与时段结果缓存
  const costCache = new WeakMap();
  const edgeCosts = function (m, net, P) {
    let c = costCache.get(net);
    if (c && c.P === P && c.it === (P.iters || 0)) return c;
    const Model = CM.Model, prm = m.params(), nE = net.nE, N = net.N, cost = new Float64Array(nE), tAct = new Float32Array(nE), open = new Uint8Array(N);
    for (let r = 0; r < net.R; r++) if (Model.boardFreq(P, net, r) > 0) for (const s of net.C.routes[r].stIdx) open[s] = 1;
    for (let e = 0; e < nE; e++) {
      const ty = net.eType[e], r = net.eRoute[e];
      if (ty === 0) {
        let fr = Model.boardFreq(P, net, r);
        if (fr > 0) {
          const shareL = net.boardShare ? net.boardShare.get(e) : null;
          if (shareL) for (const o of shareL) fr += Model.boardFreq(P, net, o);
          const w = 60 / (2 * Math.max(0.5, fr));
          cost[e] = prm.waitW * w + prm.xpen + P.stDelay[net.eSt[e]]; tAct[e] = w + P.stDelay[net.eSt[e]] * 0.5;
          if (net.eT0[e] > 0) { cost[e] += prm.walkW * net.eT0[e]; tAct[e] += net.eT0[e]; }
        } else cost[e] = INF;
      } else if (ty === 1) {
        if (!(Model.boardFreq(P, net, r) > 0)) cost[e] = INF;
        else if (net.eT0[e] > 0) { cost[e] = prm.walkW * net.eT0[e]; tAct[e] = net.eT0[e]; }
      } else if (ty === 2) {
        if (Model.dirFreq(P, net, r, net.eDir[e]) > 0) { cost[e] = net.eT0[e] * P.crowd[e]; tAct[e] = net.eT0[e]; } else cost[e] = INF;
      } else if (ty === 3) {
        const from = net.eFrom[e];
        if ((from >= N || open[from]) && open[net.eTo[e]]) { cost[e] = prm.walkW * net.eT0[e] + prm.opn + (prm.tpen - prm.xpen); tAct[e] = net.eT0[e]; } else cost[e] = INF;
      } else if (ty === 4) {
        if (Model.boardFreq(P, net, r) > 0) { cost[e] = prm.walkW * net.eT0[e]; tAct[e] = net.eT0[e]; } else cost[e] = INF;
      }
    }
    c = { P: P, it: P.iters || 0, cost: cost, tAct: tAct, prm: prm };
    costCache.set(net, c);
    return c;
  };
  // 多起点最短路：起点为步行可达的各车站（初值为步行的广义费用），终点取「到站费用 + 出站步行」最小且至少乘过一段车的车站
  const metroSearch = function (m, net, P, origins, dests) {
    const ec = edgeCosts(m, net, P), cost = ec.cost, prm = ec.prm;
    const nn = net.nNodes, dist = new Float64Array(nn).fill(INF), dkm = new Float32Array(nn), pred = new Int32Array(nn).fill(-1), heap = new U.Heap(256);
    for (const o of origins) { const c0 = prm.walkW * o.min; if (c0 < dist[o.s]) { dist[o.s] = c0; heap.push(c0, o.s); } }
    while (heap.n) {
      const u = heap.pop(), du = heap.lastKey;
      if (du > dist[u]) continue;
      for (let k = net.outStart[u]; k < net.outStart[u + 1]; k++) {
        const e = net.outEdge[k], ce = cost[e]; if (ce >= INF) continue;
        const v = net.eTo[e], nd = du + ce;
        if (nd < dist[v]) { dist[v] = nd; dkm[v] = dkm[u] + net.eKm[e]; pred[v] = e; heap.push(nd, v); }
      }
    }
    let best = INF, bt = null;
    for (const d of dests) { const ex = net.exits[d.s]; if (dist[ex] >= INF || !(dkm[ex] > 0)) continue; const c = dist[ex] + prm.walkW * d.min; if (c < best) { best = c; bt = d; } }
    if (!bt) return null;
    const edges = []; let v = net.exits[bt.s], guard = 0;
    while (pred[v] >= 0 && guard++ < 20000) { const e = pred[v]; edges.push(e); v = net.eFrom[e]; }
    edges.reverse();
    const o = origins.find(function (x) { return x.s === v; });
    if (!o) return null;
    return { o: o, d: bt, edges: edges, gt: best, km: dkm[net.exits[bt.s]], tAct: ec.tAct, prm: prm, P: P };
  };
  const addPts = function (arr, seg) { for (let i = 0; i < seg.length; i++) { const p = seg[i]; if (arr.length) { const q = arr[arr.length - 1]; if (Math.abs(q[0] - p[0]) < 1e-6 && Math.abs(q[1] - p[1]) < 1e-6) continue; } arr.push([p[0], p[1]]); } };
  // 路径拆成各段：walk 步行 / wait 候车 / ride 乘车 / xfer 换乘（inSt 站内通道，否则站外步行）
  const metroLegs = function (g, net, res, from, to) {
    const C = net.C, city = g.city, legs = [], tAct = res.tAct, name = function (k) { return C.stations[k].name; }, xy = function (k) { return [C.stations[k].x, C.stations[k].y]; };
    const o = res.o, win = walkPts(city, o, from.x, from.y); win.push(xy(o.s));
    legs.push({ k: 'walk', min: o.min, m: o.m, pts: win, to: name(o.s) });
    let ride = null, pre = 0, lastSt = o.s;
    for (const e of res.edges) {
      const ty = net.eType[e], t = tAct[e];
      if (ty === 0) {
        const r = net.eRoute[e], rt = C.routes[r], st = net.eSt[e];
        legs.push({ k: 'wait', min: t + pre, st: name(st), route: r, color: rt.color, label: rt.label });
        pre = 0;
        ride = { k: 'ride', min: 0, route: r, line: rt.lineId, color: rt.color, label: rt.label, from: name(st), to: name(st), stops: 0, km: 0, pts: [], crowd: 1 };
      } else if (ty === 2 && ride) {
        const rt = C.routes[net.eRoute[e]], k = net.eLeg[e], d = net.eDir[e], n = rt.stIdx.length;
        ride.min += t; ride.stops++; ride.km += net.eKm[e]; if (res.P.crowd[e] > ride.crowd) ride.crowd = res.P.crowd[e];
        let seg = rt.pts.slice(rt.stopPt[k], rt.stopPt[k + 1] + 1); if (d === 1) seg = seg.reverse();
        addPts(ride.pts, seg);
        ride.to = name(d === 0 ? rt.stIdx[(k + 1) % n] : rt.stIdx[k]);
      } else if (ty === 1) {
        if (ride) { ride.min += t; legs.push(ride); lastSt = net.eSt[e]; ride = null; }
      } else if (ty === 4) {
        if (ride) { legs.push(ride); ride = null; lastSt = net.eSt[e]; legs.push({ k: 'xfer', min: t, inSt: true, st: name(net.eSt[e]) }); }
        else pre += t;   // 进站时去另一层站台的竖向通道
      } else if (ty === 3) {
        const b = net.eSt[e];
        legs.push({ k: 'xfer', min: t, inSt: false, st: name(lastSt), to: name(b), m: net.eWm[e], pts: [xy(lastSt), xy(b)] });
        lastSt = b;
      }
    }
    if (ride) legs.push(ride);
    const d = res.d, wout = walkPts(city, d, to.x, to.y).reverse(); wout.unshift(xy(d.s));
    legs.push({ k: 'walk', min: d.min, m: d.m, pts: wout, from: name(d.s) });
    return legs;
  };
  // 汽车行程表（与 Model.carSkim 同一张表，另取里程）
  const skimOf = function (P, a, b) {
    const L = P.skimLay, T = P.skimT, K = P.skimK;
    if (!L || !T || !K || T.length !== L.n || a < 0 || a >= L.Z) return null;
    let lo = L.start[a], hi = L.start[a + 1] - 1;
    while (lo <= hi) { const mi = (lo + hi) >> 1, v = L.dest[mi]; if (v < b) lo = mi + 1; else if (v > b) hi = mi - 1; else return Math.abs(T[mi]) > 0 ? { t: Math.abs(T[mi]), k: Math.abs(K[mi]) } : null; }
    return null;
  };
  // 开车路线（只在要画出来时计算）：道路网上按本时段拥堵后的行程时间找最短路，起终点经小区的接入点上下道路
  const roadPath = function (m, zo, zd, P) {
    const road = m.road, so = road.zoneConn[zo] || [], sd = road.zoneConn[zd] || [];
    if (!so.length || !sd.length) return null;
    const nN = road.nN, dist = new Float64Array(nN).fill(INF), pred = new Int32Array(nN).fill(-1), heap = new U.Heap(512);
    const tm = P.arcTime && P.arcTime.length === road.nA ? P.arcTime : road.arcT0, goal = new Map();
    for (const c of sd) goal.set(c.node, Math.min(goal.get(c.node) == null ? INF : goal.get(c.node), c.t));
    for (const c of so) if (c.t < dist[c.node]) { dist[c.node] = c.t; heap.push(c.t, c.node); }
    let best = INF, bn = -1;
    while (heap.n) {
      const u = heap.pop(), du = heap.lastKey;
      if (du > dist[u]) continue;
      if (du >= best) break;
      const gl = goal.get(u); if (gl != null && du + gl < best) { best = du + gl; bn = u; }
      for (let k = road.outStart[u]; k < road.outStart[u + 1]; k++) {
        const a = road.outArc[k], v = road.arcTo[a], nd = du + tm[a];
        if (nd < dist[v]) { dist[v] = nd; pred[v] = a; heap.push(nd, v); }
      }
    }
    if (bn < 0) return null;
    const arcs = []; let v = bn, guard = 0;
    while (pred[v] >= 0 && guard++ < 50000) { arcs.push(pred[v]); v = road.arcFrom[pred[v]]; }
    arcs.reverse();
    const pts = [];
    for (const a of arcs) { const L = road.links[a >> 1]; if (!L || !L.pts) continue; addPts(pts, (a & 1) ? L.pts.slice().reverse() : L.pts); }
    return pts.length > 1 ? pts : null;
  };

  // 查询：from / to 为 { x, y }（格坐标）；opts.per 时段（0–3），opts.geom 是否计算开车路线
  // 返回 { metro: { min, legs, walk, wait, ride, xfer, fare, km, xfers } | null, why, car: { min, park, cost, km, pts }, bus: { min, name }, walk: { min }, share, km }
  J.plan = function (g, from, to, opts) {
    opts = opts || {};
    const m = g.model, city = g.city, per = opts.per || 0, P = J.period(g, per);
    const out = { from: from, to: to, per: per, km: kmOf(from.x, from.y, to.x, to.y), metro: null, why: '', car: null, bus: null, walk: null, share: null, ok: !!P };
    const co = city.cellAt(from.x, from.y), cd = city.cellAt(to.x, to.y);
    if (co < 0 || cd < 0) { out.ok = false; out.why = '地点在地图范围以外'; return out; }
    const zo = city.zoneOf(co), zd = city.zoneOf(cd), prm = m.params(), y = m.year || g.clock.y;
    out.zo = zo; out.zd = zd;
    // 步行：直线 × 1.3
    out.walk = { min: out.km * 1.3 * 1000 / CFG.walk.mPerMin };
    if (!P) { out.why = '交通数据正在更新'; return out; }
    // 开车
    let sk = skimOf(P, zo, zd), ct, ck;
    if (sk) { ct = sk.t; ck = sk.k; } else { const st = out.km * 1.3; ct = st / 16 * 60 + 3; ck = st; }
    if (zo === zd) { const st = Math.max(0.4, out.km * 1.3); ct = Math.min(ct, st / 20 * 60 + 2); ck = st; }
    const carMoney = ck * prm.cpk + prm.park;
    out.car = { min: ct + prm.carAccess * 0.5, drive: ct, park: prm.carAccess * 0.5, km: ck, cost: carMoney, pts: opts.geom ? roadPath(m, zo, zd, P) : null };
    // 公交（背景交通）
    const bg = CM.Eras ? CM.Eras.bg(y) : null;
    if (bg && bg.road != null) out.bus = { min: ct * (bg.slow || 1) + bg.wait, wait: bg.wait, name: bg.name, fare: bg.fare, pts: out.car.pts };
    else if (bg) out.bus = { min: out.km * 1.25 / Math.max(1, bg.speed) * 60 + bg.wait, wait: bg.wait, name: bg.name, fare: bg.fare, pts: null };
    else out.bus = { min: ct * 1.5 + 8, wait: 8, name: '', fare: 0, pts: out.car.pts, est: true };
    // 地铁
    const net = m.net, oL = J.walkLinks(g, from.x, from.y), dL = J.walkLinks(g, to.x, to.y);
    if (!net.C.stations.some(function (s, k) { return net.C.serviced[k]; })) out.why = '城市还没有运营中的地铁';
    else if (!oL.length) out.why = '起点 15 分钟步行范围内没有运营车站';
    else if (!dL.length) out.why = '终点 15 分钟步行范围内没有运营车站';
    else {
      const res = metroSearch(m, net, P, oL, dL);
      if (!res) out.why = oL.some(function (a) { return dL.some(function (b) { return b.s === a.s; }); }) ? '两地离同一座车站都很近，步行更快' : '附近的车站之间没有连通的线路';
      else {
        const legs = metroLegs(g, net, res, from, to), sum = function (k) { return legs.reduce(function (a, l) { return a + (l.k === k ? l.min : 0); }, 0); };
        const fare = CM.Model.fareAt(m.fare, res.km), walkMin = sum('walk'), xferMin = sum('xfer');
        out.metro = { legs: legs, walk: walkMin, wait: sum('wait'), ride: sum('ride'), xfer: xferMin, fare: fare, km: res.km,
          xfers: legs.filter(function (l) { return l.k === 'ride'; }).length - 1, min: legs.reduce(function (a, l) { return a + l.min; }, 0), from: net.C.stations[res.o.s].name, to: net.C.stations[res.d.s].name };
        // 坐地铁的比例：与方式选择同一个 Logit（地铁广义费用含票价折合分钟，开车含停车与油费、混入背景交通；两端车站周边的乘车习惯）
        const vot = prm.vot, fareMin = CM.Model.fareMinAt ? CM.Model.fareMinAt(m.fare, res.km, y, vot) : 0;
        const gtM = res.gt - prm.xpen + fareMin;
        let gtCar = ct + prm.carAccess + carMoney / vot * 60;
        if (bg) { const sh = bg.share; const tBg = out.bus.min; gtCar = (1 - sh) * gtCar + sh * (tBg + (bg.fare || 0) / vot * 60); }
        const hb = m.habit && m.habit.length === m.Z ? (m.habit[zo] + m.habit[zd]) * 0.5 : 0;
        out.share = 1 / (1 + Math.exp(prm.theta * (gtM - gtCar - (CFG.habit ? CFG.habit.asc : 0) * hb)));
      }
    }
    // 最快的方式
    const opt = [['metro', out.metro && out.metro.min], ['bus', out.bus && out.bus.min], ['car', out.car && out.car.min], ['walk', out.walk.min <= 45 ? out.walk.min : null]].filter(function (o) { return o[1] > 0; });
    opt.sort(function (a, b) { return a[1] - b[1]; });
    out.best = opt.length ? opt[0][0] : null;
    return out;
  };
  J.modeName = { metro: '地铁', bus: '公交', car: '开车', walk: '步行' };
  J.fmtMin = function (v) { v = Math.max(0, v); return v < 1 ? '不到 1' : String(Math.round(v)); };

  // 小地图的清晰底图：按当前缩放（每格像素）分块重画地面（与城市地图同一套 drawGround：水系、道路、公园、街区），
  // 若干小地图共用每座城市的清晰瓦片，最多保存 80 块。
  const TILE = 16, tileCache = new WeakMap();
  const tilesFor = function (R, g) {
    const c = g.city, k = [c.version, c.roadVersion, c.terrainVer, c.lockVer, R.themeName].join('|');
    let entry = tileCache.get(c);
    if (entry?.key !== k) { entry = { key: k, map: new Map(), order: [] }; tileCache.set(c, entry); }
    return entry;
  };
  const renderTile = function (R, g, lvl, i, j) {
    const W = g.city.W, H = g.city.H, x0 = i * TILE, y0 = j * TILE, x1 = Math.min(W, x0 + TILE), y1 = Math.min(H, y0 + TILE);
    const cv = document.createElement('canvas'); cv.width = Math.max(1, Math.ceil((x1 - x0) * lvl)); cv.height = Math.max(1, Math.ceil((y1 - y0) * lvl));
    const c = cv.getContext('2d');
    c.setTransform(lvl, 0, 0, lvl, -x0 * lvl, -y0 * lvl); c.beginPath(); c.rect(x0, y0, x1 - x0, y1 - y0); c.clip();
    c.fillStyle = (R.th && R.th.ground && R.th.ground.land) || '#edf2f6'; c.fillRect(x0, y0, x1 - x0, y1 - y0);
    try { R.drawGround(c, x0, y0, x1, y1, lvl); } catch (e) { /* 画不出来就用总览图 */ }
    return cv;
  };

  // ======================== 小地图 ========================
  // 总览底图（与城市地图同一套地面）+ 线网 + 路线与标记；拖动平移、滚轮缩放、单击选点（onPick），可选一个沿路线循环移动的小点
  J.mapView = function (g, opts) {
    opts = opts || {};
    const R = CM.R, city = g.city, W = city.W, H = city.H;
    const wrap = h('div', { class: 'jm' + (opts.cls ? ' ' + opts.cls : '') }), cv = h('canvas', { class: 'jm-cv' });
    const zin = h('button', { class: 'jm-z', 'aria-label': '放大', onclick: function () { zoom(1.4); } }, CM.icon('plus', 14));
    const zout = h('button', { class: 'jm-z', 'aria-label': '缩小', onclick: function () { zoom(1 / 1.4); } }, CM.icon('minus', 14));
    const zfit = h('button', { class: 'jm-z', 'aria-label': '看全路线', onclick: function () { fit(true, true); } }, CM.icon('expand', 14));
    wrap.append(cv, h('div', { class: 'jm-zs' }, zin, zout, zfit));
    if (opts.hint) wrap.appendChild(h('div', { class: 'jm-hint' }, opts.hint));
    const st = { cx: W / 2, cy: H / 2, s: 2, route: null, pins: [], anim: null, raf: 0, alive: true };
    const keep = opts.state || null;   // 导航页重绘时沿用原来的平移缩放
    if (keep && keep.s) { st.cx = keep.cx; st.cy = keep.cy; st.s = keep.s; st.restored = true; }
    let cw = 0, chh = 0, dpr = 1;
    const base = function () {
      if (R && R.game === g) { if (!R.overview) { try { R.renderOverview(); } catch (e) { return null; } } return R.overview; }
      return null;
    };
    const night = function () { return document.documentElement.dataset.theme === 'dark'; };
    const toS = function (x, y) { return [(x - st.cx) * st.s + cw / 2, (y - st.cy) * st.s + chh / 2]; };
    const toW = function (sx, sy) { return [(sx - cw / 2) / st.s + st.cx, (sy - chh / 2) / st.s + st.cy]; };
    const sMin = function () { return Math.max(0.5, Math.min(cw / W, chh / H) * 0.9); };
    const clampView = function () { st.s = U.clamp(st.s, sMin(), 40); st.cx = U.clamp(st.cx, 0, W); st.cy = U.clamp(st.cy, 0, H); };
    const line = function (ctx, pts, close) { ctx.beginPath(); for (let i = 0; i < pts.length; i++) { const p = toS(pts[i][0], pts[i][1]); if (i) ctx.lineTo(p[0], p[1]); else ctx.moveTo(p[0], p[1]); } if (close) ctx.closePath(); };
    const routePts = function () {
      const r = st.route; if (!r) return null;
      const all = []; for (const L of r.legs || []) if (L.pts && L.pts.length > 1) addPts(all, L.pts);
      return all.length > 1 ? all : null;
    };
    const draw = function () {
      if (!st.alive) return;
      dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = Math.max(1, cv.offsetWidth), hh = Math.max(1, cv.offsetHeight);   // 布局尺寸：地铁圈窗口打开时的缩放动画不影响
      if (w !== cw || hh !== chh || cv.width !== Math.round(w * dpr)) { cw = w; chh = hh; cv.width = Math.round(w * dpr); cv.height = Math.round(hh * dpr); clampView(); }
      const ctx = cv.getContext('2d'), dk = night(), fam = st.fam || (st.fam = getComputedStyle(document.body).fontFamily || 'sans-serif');
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = dk ? '#16202e' : '#dfe8f0'; ctx.fillRect(0, 0, cw, chh);
      const b = base();
      if (b) { const p = toS(0, 0); ctx.imageSmoothingEnabled = true; ctx.drawImage(b, 0, 0, b.width, b.height, p[0], p[1], W * st.s, H * st.s); }
      // 清晰底图：总览图每格只有 4 像素，推近后按缩放分块重画（没画好的块先用总览图顶着）
      const want = st.s * dpr, lvl = want <= 4.5 ? 0 : want <= 9 ? 8 : want <= 18 ? 16 : 32;
      st.need = null;
      if (lvl && R && R.game === g && R.drawGround) {
        const TC = tilesFor(R, g), a = toW(0, 0), z = toW(cw, chh), need = [];
        const i0 = Math.max(0, Math.floor(a[0] / TILE)), j0 = Math.max(0, Math.floor(a[1] / TILE)), i1 = Math.min(Math.ceil(W / TILE) - 1, Math.floor(z[0] / TILE)), j1 = Math.min(Math.ceil(H / TILE) - 1, Math.floor(z[1] / TILE));
        for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
          const k = lvl + ':' + i + ':' + j, t = TC.map.get(k);
          if (t) { const p = toS(i * TILE, j * TILE); ctx.drawImage(t, p[0], p[1], t.width / lvl * st.s, t.height / lvl * st.s); }
          else need.push({ k: k, i: i, j: j, d: Math.hypot((i + 0.5) * TILE - st.cx, (j + 0.5) * TILE - st.cy) });
        }
        if (need.length) { need.sort(function (p, q) { return p.d - q.d; }); st.need = { lvl: lvl, list: need, TC: TC }; }
      }
      // 地名（推近后，避开彼此重叠）：帮助认出是哪一片
      if (st.s >= 4) {
        const boxes = [], P = CM.DATA.places || [], cap = st.s >= 12 ? 70 : 40;
        ctx.font = '500 11px ' + fam; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; let n = 0;
        for (const pl of P) {
          if (n >= cap) break;
          const p = toS(pl[1], pl[2]); if (p[0] < 10 || p[1] < 10 || p[0] > cw - 10 || p[1] > chh - 10) continue;
          const w = ctx.measureText(pl[0]).width + 6, bx = [p[0] - w / 2, p[1] - 8, p[0] + w / 2, p[1] + 8];
          if (boxes.some(function (q) { return bx[0] < q[2] && bx[2] > q[0] && bx[1] < q[3] && bx[3] > q[1]; })) continue;
          boxes.push(bx); n++;
          ctx.lineWidth = 3; ctx.strokeStyle = dk ? 'rgba(10,16,26,.8)' : 'rgba(255,255,255,.85)'; ctx.strokeText(pl[0], p[0], p[1]);
          ctx.fillStyle = dk ? 'rgba(203,213,225,.9)' : 'rgba(71,85,105,.95)'; ctx.fillText(pl[0], p[0], p[1]);
        }
      }
      // 线网
      const C = g.model && g.model.net ? g.model.net.C : null;
      if (C) {
        const lw = U.clamp(st.s * 0.22, 1.6, 5), fade = st.route ? 0.45 : 0.95;
        ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        C.segs.forEach(function (cs) {
          const L = g.net.lines[cs.seg.line]; if (!L || !cs.g || !cs.g.pts) return;
          line(ctx, cs.g.pts); ctx.globalAlpha = fade; ctx.strokeStyle = L.color; ctx.lineWidth = lw; ctx.stroke();
        });
        ctx.globalAlpha = 1;
        if (st.s >= 3) {
          const rr = U.clamp(st.s * 0.18, 2, 4.5);
          C.stations.forEach(function (s, k) { if (!C.serviced[k]) return; const p = toS(s.x, s.y); if (p[0] < -10 || p[1] < -10 || p[0] > cw + 10 || p[1] > chh + 10) return; ctx.beginPath(); ctx.arc(p[0], p[1], rr, 0, Math.PI * 2); ctx.fillStyle = dk ? '#1c2636' : '#fff'; ctx.fill(); ctx.lineWidth = 1.2; ctx.strokeStyle = dk ? '#cfd8e3' : '#4a5568'; ctx.stroke(); });
        }
        if (st.s >= 9) {
          ctx.font = '600 11px ' + fam; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
          C.stations.forEach(function (s, k) { if (!C.serviced[k]) return; const p = toS(s.x, s.y); if (p[0] < 0 || p[1] < 0 || p[0] > cw || p[1] > chh) return; ctx.lineWidth = 3; ctx.strokeStyle = dk ? 'rgba(10,16,26,.85)' : 'rgba(255,255,255,.9)'; ctx.strokeText(s.name, p[0] + 6, p[1]); ctx.fillStyle = dk ? '#e5ebf2' : '#2d3748'; ctx.fillText(s.name, p[0] + 6, p[1]); });
        }
      }
      // 路线
      const rt = st.route;
      if (rt) {
        if (rt.car && rt.car.pts && rt.showCar) { line(ctx, rt.car.pts); ctx.setLineDash([]); ctx.strokeStyle = dk ? 'rgba(160,180,210,.75)' : 'rgba(90,110,140,.7)'; ctx.lineWidth = 3; ctx.stroke(); }
        for (const L of rt.legs || []) {
          if (!L.pts || L.pts.length < 2) continue;
          line(ctx, L.pts);
          if (L.k === 'ride') { ctx.setLineDash([]); ctx.strokeStyle = dk ? '#0b1220' : '#fff'; ctx.lineWidth = U.clamp(st.s * 0.5, 5, 10); ctx.stroke(); ctx.strokeStyle = L.color; ctx.lineWidth = U.clamp(st.s * 0.34, 3, 7); ctx.stroke(); }
          else if (L.k === 'car') { ctx.setLineDash([]); ctx.strokeStyle = dk ? '#0b1220' : '#fff'; ctx.lineWidth = 6; ctx.stroke(); ctx.strokeStyle = dk ? '#9fb3cf' : '#5b6f8c'; ctx.lineWidth = 3.4; ctx.stroke(); }
          else { ctx.setLineDash([4, 4]); ctx.strokeStyle = dk ? '#e2e8f0' : '#334155'; ctx.lineWidth = 2.4; ctx.stroke(); ctx.setLineDash([]); }
        }
        // 换乘与上下车的车站
        for (const L of rt.legs || []) if (L.k === 'ride' && L.pts && L.pts.length) for (const q of [L.pts[0], L.pts[L.pts.length - 1]]) { const p = toS(q[0], q[1]); ctx.beginPath(); ctx.arc(p[0], p[1], 4.5, 0, Math.PI * 2); ctx.fillStyle = '#fff'; ctx.fill(); ctx.lineWidth = 2.2; ctx.strokeStyle = L.color; ctx.stroke(); }
      }
      // 标记
      for (const pn of st.pins) {
        const p = toS(pn.x, pn.y), col = pn.color || '#1e6fd9';
        ctx.beginPath(); ctx.moveTo(p[0], p[1]); ctx.bezierCurveTo(p[0] - 9, p[1] - 12, p[0] - 9, p[1] - 24, p[0], p[1] - 24); ctx.bezierCurveTo(p[0] + 9, p[1] - 24, p[0] + 9, p[1] - 12, p[0], p[1]);
        ctx.fillStyle = col; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = '#fff'; ctx.stroke();
        ctx.fillStyle = '#fff'; ctx.font = '700 11px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(pn.ch || '', p[0], p[1] - 16.5);
        if (pn.label) { ctx.font = '600 11.5px ' + fam; ctx.textAlign = 'left'; ctx.lineWidth = 3.2; ctx.strokeStyle = dk ? 'rgba(10,16,26,.9)' : 'rgba(255,255,255,.95)'; ctx.strokeText(pn.label, p[0] + 11, p[1] - 16); ctx.fillStyle = dk ? '#f1f5f9' : '#1a202c'; ctx.fillText(pn.label, p[0] + 11, p[1] - 16); }
      }
      // 沿路线移动的小点（市民主页：他每天就这样走）
      if (keep) { keep.cx = st.cx; keep.cy = st.cy; keep.s = st.s; }
      if (st.anim && st.anim.pts) {
        const A = st.anim, tot = A.cum[A.cum.length - 1], d = ((performance.now() - A.t0) / 1000 * A.speed) % (tot * 1.15);
        const dd = Math.min(d, tot); let i = 1; while (i < A.cum.length - 1 && A.cum[i] < dd) i++;
        const a = A.pts[i - 1], bq = A.pts[i], f = (dd - A.cum[i - 1]) / Math.max(1e-9, A.cum[i] - A.cum[i - 1]), p = toS(a[0] + (bq[0] - a[0]) * f, a[1] + (bq[1] - a[1]) * f);
        ctx.beginPath(); ctx.arc(p[0], p[1], 8, 0, Math.PI * 2); ctx.fillStyle = 'rgba(30,111,217,.22)'; ctx.fill();
        ctx.beginPath(); ctx.arc(p[0], p[1], 4.5, 0, Math.PI * 2); ctx.fillStyle = A.color || '#1e6fd9'; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = '#fff'; ctx.stroke();
      }
    };
    const loop = function () {
      st.raf = 0; if (!st.alive || !wrap.isConnected) { if (!wrap.isConnected && st.started) st.alive = false; return; } st.started = true;
      // 每帧最多花约 12 ms 画新的清晰分块，画完一批再刷新
      const N = st.need;
      if (N && N.list.length) {
        const t0 = performance.now();
        while (N.list.length && performance.now() - t0 < 12) {
          const q = N.list.shift(); if (N.TC.map.has(q.k)) continue;
          N.TC.map.set(q.k, renderTile(R, g, N.lvl, q.i, q.j)); N.TC.order.push(q.k);
          while (N.TC.order.length > 80) N.TC.map.delete(N.TC.order.shift());
        }
      }
      // 平滑缩放（v3.4 玩家反馈）：每帧向目标比例靠拢（对数插值，约 0.25 秒），有锚点时锚点下的地点保持不动，没有锚点时中心一起移过去
      if (st.tw) {
        const T = st.tw, now = performance.now(), dt = st.twLast ? Math.min(50, now - st.twLast) : 16.7; st.twLast = now;
        const k = 1 - Math.pow(0.8, dt / 16.7), ls = Math.log(st.s), lt = Math.log(T.s), ns = Math.abs(lt - ls) < 0.003 ? T.s : Math.exp(ls + (lt - ls) * k);
        st.s = ns;
        if (T.ax != null) { st.cx = T.wx - (T.ax - cw / 2) / ns; st.cy = T.wy - (T.ay - chh / 2) / ns; }
        else { st.cx += (T.cx - st.cx) * k; st.cy += (T.cy - st.cy) * k; }
        clampView();
        if (ns === T.s && (T.ax != null || Math.hypot(T.cx - st.cx, T.cy - st.cy) * ns < 0.5)) { if (T.ax == null) { st.cx = T.cx; st.cy = T.cy; clampView(); } st.tw = null; st.twLast = 0; }
      }
      draw();
      if (st.anim || st.tw || (st.need && st.need.list.length)) st.raf = requestAnimationFrame(loop);
    };
    const redraw = function () { if (st.alive && !st.raf) st.raf = requestAnimationFrame(loop); };
    // 缩放只改目标（连续滚动时在目标上累加），由 loop 逐帧靠拢
    const zoom = function (f, sx, sy) {
      if (sx == null) { sx = cw / 2; sy = chh / 2; }
      const w0 = toW(sx, sy), base = st.tw ? st.tw.s : st.s;
      st.tw = { s: U.clamp(base * f, sMin(), 40), wx: w0[0], wy: w0[1], ax: sx, ay: sy }; st.twLast = 0; redraw();
    };
    const glide = function (s, cx, cy) { st.tw = { s: U.clamp(s, sMin(), 40), cx: U.clamp(cx, 0, W), cy: U.clamp(cy, 0, H) }; st.twLast = 0; redraw(); };
    const fit = function (force, smooth) {
      const pts = [];
      for (const p of st.pins) pts.push([p.x, p.y]);
      const rp = routePts(); if (rp) for (const p of rp) pts.push(p);
      if (!pts.length) { if (force) { if (smooth) { glide(0, W / 2, H / 2); return; } st.cx = W / 2; st.cy = H / 2; st.s = 0; clampView(); } redraw(); return; }
      let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9; for (const p of pts) { x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]); }
      cw = cv.offsetWidth || cw || 400; chh = cv.offsetHeight || chh || 300;
      const s1 = Math.min((cw - 70) / Math.max(4, x1 - x0), (chh - 80) / Math.max(4, y1 - y0)), cx1 = (x0 + x1) / 2, cy1 = (y0 + y1) / 2 - 1.5 / Math.max(1, s1);
      if (smooth) { glide(s1, cx1, cy1); return; }
      st.cx = cx1; st.cy = cy1; st.s = s1; clampView(); redraw();
    };
    // 单指拖动或选点，两指缩放。
    const pointers = new Map();
    let drag = null, pinch = null;
    const distance = (a, b) => Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
    const mid = function (a, b) {
      const r = cv.getBoundingClientRect();
      return [(a.clientX + b.clientX) / 2 - r.left, (a.clientY + b.clientY) / 2 - r.top];
    };
    cv.addEventListener('pointerdown', function (e) {
      if (e.button !== 0 || pointers.size >= 2) return;
      st.tw = null;
      pointers.set(e.pointerId, e);
      try { cv.setPointerCapture(e.pointerId); } catch (er) { /* 不支持 */ }
      if (pointers.size === 1) { drag = { x: e.clientX, y: e.clientY, cx: st.cx, cy: st.cy, moved: false }; return; }
      const [a, b] = pointers.values();
      pinch = { at: toW(...mid(a, b)), distance: Math.max(1, distance(a, b)), scale: st.s };
      drag = null;
    });
    cv.addEventListener('pointermove', function (e) {
      if (!pointers.has(e.pointerId)) return;
      pointers.set(e.pointerId, e);
      if (pinch) {
        const [a, b] = pointers.values(), [x, y] = mid(a, b);
        st.s = U.clamp(pinch.scale * distance(a, b) / pinch.distance, sMin(), 40);
        st.cx = pinch.at[0] - (x - cw / 2) / st.s;
        st.cy = pinch.at[1] - (y - chh / 2) / st.s;
      } else {
        if (!drag) return;
        const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
        if (!drag.moved && Math.hypot(dx, dy) < 4) return;
        drag.moved = true; st.cx = drag.cx - dx / st.s; st.cy = drag.cy - dy / st.s;
      }
      wrap.classList.add('grabbing'); clampView(); redraw();
    });
    const finishPointer = function (e) {
      if (!pointers.delete(e.pointerId)) return;
      if (pinch) {
        const a = pointers.values().next().value;
        pinch = null; drag = a ? { x: a.clientX, y: a.clientY, cx: st.cx, cy: st.cy, moved: true } : null;
        return;
      }
      const d = drag; drag = null; wrap.classList.remove('grabbing');
      if (d && !d.moved && e.type === 'pointerup' && opts.onPick) {
        const r = cv.getBoundingClientRect(), [x, y] = toW(e.clientX - r.left, e.clientY - r.top);
        if (x >= 0 && y >= 0 && x < W && y < H) opts.onPick({ x: x, y: y });
      }
    };
    for (const event of ['pointerup', 'pointercancel', 'lostpointercapture']) cv.addEventListener(event, finishPointer);
    cv.addEventListener('wheel', function (e) { e.preventDefault(); const r = cv.getBoundingClientRect(); zoom(Math.pow(1.0015, -e.deltaY), e.clientX - r.left, e.clientY - r.top); }, { passive: false });
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(redraw);
    if (ro) ro.observe(wrap);
    const api = {
      el: wrap,
      setPins: function (pins) { st.pins = pins || []; redraw(); },
      setRoute: function (route, animate) {
        st.route = route || null;
        const pts = routePts();
        st.anim = animate && pts ? { pts: pts, cum: U.cumLen(pts), t0: performance.now(), speed: Math.max(6, U.cumLen(pts).slice(-1)[0] / 6), color: animate.color } : null;
        redraw();
      },
      fit: fit, redraw: redraw,
      center: function (x, y, s, smooth) { if (smooth) { glide(s || st.s, x, y); return; } st.cx = x; st.cy = y; if (s) st.s = s; clampView(); redraw(); },
      destroy: function () { st.alive = false; if (ro) ro.disconnect(); if (st.raf) cancelAnimationFrame(st.raf); },
    };
    requestAnimationFrame(function () { if (!st.alive) return; if (st.restored) redraw(); else fit(true); });
    return api;
  };

  // 在城市地图上高亮一条行程（关闭地铁圈后）：路线各段、起终点标记，镜头飞到能看全路线
  J.showOnMap = function (ui, route, pins, title) {
    const R = ui && ui.R; if (!R || !route) return;
    const legs = (route.legs || []).filter(function (L) { return L.pts && L.pts.length > 1; }).map(function (L) { return { k: L.k, color: L.color, pts: L.pts }; });
    if (!legs.length && route.car && route.car.pts) legs.push({ k: 'car', pts: route.car.pts });
    const all = []; for (const L of legs) for (const p of L.pts) all.push(p); for (const p of pins || []) all.push([p.x, p.y]);
    if (!all.length) return;
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9; for (const p of all) { x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]); }
    R.setHighlight({ kind: 'trip', legs: legs, pins: pins || [], dur: 25, label: title || '', lx: (x0 + x1) / 2, ly: y0 });
    const span = Math.max(4, x1 - x0, (y1 - y0) * (R.w / Math.max(1, R.h)));
    if (ui.flyTo) ui.flyTo((x0 + x1) / 2, (y0 + y1) / 2, U.clamp(R.w / span * 0.7, 4, 40));
  };
})(window.CM);
