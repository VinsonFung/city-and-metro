'use strict';
// 既有铁路接管与现代化改造（v3.0，通用机制 railTakeover）：地图数据（traits 的 railTakeover → DATA.takeover）指定一两条既有铁路，
// 写明车站（id、站名、位置、开站与停站年月）、区间（routes：车站序列、通车年月、是否环线）、地面图上对应的铁路名（rail）与接管开放年月（open）。
// 玩家选起点站和终点站，系统沿区间找出两站之间连续、未接管、已通车的一段；按当年物价一次付清接管与现代化改造费（轨道每公里、车站改造、基础车队），
// 确认后立即得到轨道、车站和配属列车并投入运营。接管来的区段与车站带 tk（铁路编号）与 tkE / tkStop（数据里的稳定编号），存进存档的线网本身：
// 哪些区段已接管由线网推出，读档、撤销、跳年不需要另存状态。没接管的区段照常算背景交通；接管的里程按比例从背景交通里扣掉（bgCut），同一批乘客不重复计算。
// 接管的车站与玩家已有车站各自独立，换乘按步行换乘规则自动形成；边界站可以换乘，玩家的列车只在接管的轨道上运行。历史事件只写纪事，不改动接管的线路。
// 玩法只读数据，不按城市判断
(function (CM) {
  const U = CM.U, h = U.h, ic = function (n, s) { return CM.icon(n, s); };
  const T = {};
  CM.Takeover = T;
  const M = function () { return CM.Metro; };
  const yof = function (v) { return v == null ? null : (Array.isArray(v) ? v[0] + ((v[1] || 1) - 1) / 12 : v); };
  const ymText = function (v) { return Array.isArray(v) ? v[0] + ' 年 ' + (v[1] || 1) + ' 月' : v + ' 年'; };
  const ekey = function (a, b) { return a < b ? a + '|' + b : b + '|' + a; };
  T.list = function () { return (CM.DATA && CM.DATA.takeover) || []; };
  T.byId = function (id) { return T.list().find(function (R) { return R.id === id; }) || null; };
  T.openAt = function (R, t) { return t >= yof(R.open) - 1e-6; };
  T.stopOpen = function (s, t) { return (s.y0 == null || t >= yof(s.y0) - 1e-6) && (s.y1 == null || t < yof(s.y1) - 1e-6); };
  const edgeOpen = function (e, t) { return e.y0 == null || t >= yof(e.y0) - 1e-6; };

  // ---------- 车站与区间图（数据，按线路缓存） ----------
  const gCache = new WeakMap();
  T.graph = function (R) {
    let G = gCache.get(R); if (G) return G;
    const st = new Map(), adj = new Map(), edges = new Map();
    for (const s of R.stops) { st.set(s.id, s); adj.set(s.id, []); }
    for (const r of R.routes) {
      const ids = r.stops, n = ids.length;
      for (let i = 0; i + 1 < n + (r.loop ? 1 : 0); i++) {
        const a = ids[i], b = ids[(i + 1) % n], k = ekey(a, b);
        if (edges.has(k) || !adj.has(a) || !adj.has(b)) continue;
        edges.set(k, { k: k, a: a, b: b, y0: r.y0 }); adj.get(a).push(b); adj.get(b).push(a);
      }
    }
    G = { st: st, adj: adj, edges: edges, loops: R.routes.filter(function (r) { return r.loop; }) };
    gCache.set(R, G); return G;
  };

  // ---------- 地面图上的铁路走向（Geo.rail 里名称匹配的折线，组成图后按最短路取两站之间的线位） ----------
  const rCache = new WeakMap();
  const railGraph = function (R) {
    const rail = (CM.Geo && CM.Geo.rail) || [], c = rCache.get(R); if (c && c.rail === rail) return c.G;
    const names = R.rail || [], match = function (n) { return !!n && names.some(function (k) { return n === k || n.indexOf(k) === 0; }); };
    const xs = [], ys = [], adj = [], key = new Map(), ends = [];
    const node = function (x, y) { const k = Math.round(x * 16) * 131072 + Math.round(y * 16); let i = key.get(k); if (i == null) { i = xs.length; key.set(k, i); xs.push(x); ys.push(y); adj.push([]); } return i; };
    const link = function (u, v, f) { if (u === v) return; const d = Math.hypot(xs[v] - xs[u], ys[v] - ys[u]); adj[u].push(v, d, f); adj[v].push(u, d, f); };
    for (const r of rail) {
      if (!match(r.name)) continue;
      const p = r.p, f = r.flags & 3; let prev = -1;
      for (let i = 0; i + 1 < p.length; i += 2) { const v = node(p[i], p[i + 1]); if (prev >= 0) link(prev, v, f); prev = v; }
      if (p.length >= 4) ends.push(node(p[0], p[1]), node(p[p.length - 2], p[p.length - 1]));
    }
    const bk = new Map();
    for (let i = 0; i < xs.length; i++) { const k = Math.floor(xs[i]) * 8192 + Math.floor(ys[i]); let a = bk.get(k); if (!a) bk.set(k, a = []); a.push(i); }
    const near = function (x, y, r, skip) {
      let best = -1, bd = r;
      for (let gx = Math.floor(x - r); gx <= Math.floor(x + r); gx++) for (let gy = Math.floor(y - r); gy <= Math.floor(y + r); gy++) {
        const a = bk.get(gx * 8192 + gy); if (!a) continue;
        for (const i of a) { if (skip && skip(i)) continue; const d = Math.hypot(xs[i] - x, ys[i] - y); if (d < bd) { bd = d; best = i; } }
      }
      return best;
    };
    // 折线断头（数据分段、隧道口）接到 60 m 内另一条折线上
    for (const e of ends) { const nb = adj[e]; const j = near(xs[e], ys[e], 0.25, function (i) { if (i === e) return true; for (let q = 0; q < nb.length; q += 3) if (nb[q] === i) return true; return false; }); if (j >= 0) link(e, j, 0); }
    const G = { xs: xs, ys: ys, adj: adj, near: near, n: xs.length };
    rCache.set(R, { rail: rail, G: G });
    return G;
  };
  // 最短路（二叉堆 Dijkstra）
  const shortest = function (G, s, t) {
    const n = G.n, dist = new Float64Array(n).fill(Infinity), prev = new Int32Array(n).fill(-1), heap = [];
    const push = function (d, v) { heap.push([d, v]); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; const x = heap[p]; heap[p] = heap[i]; heap[i] = x; i = p; } };
    const pop = function () { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; const x = heap[m]; heap[m] = heap[i]; heap[i] = x; i = m; } } return top; };
    dist[s] = 0; push(0, s);
    while (heap.length) {
      const q = pop(), d = q[0], u = q[1]; if (d > dist[u]) continue; if (u === t) break;
      const a = G.adj[u]; for (let k = 0; k < a.length; k += 3) { const v = a[k], nd = d + a[k + 1]; if (nd < dist[v]) { dist[v] = nd; prev[v] = u; push(nd, v); } }
    }
    if (!isFinite(dist[t])) return null;
    const out = []; for (let v = t; v >= 0; v = prev[v]) { out.push(v); if (v === s) break; }
    return out.reverse();
  };
  // 车站在铁路上的位置：数据坐标就近吸附到线位上（1.5 格内）
  const posCache = new WeakMap();
  T.stopPos = function (R, s) {
    let P = posCache.get(R); if (!P) posCache.set(R, P = new Map());
    let p = P.get(s.id); if (p) return p;
    const G = railGraph(R), i = G.n ? G.near(s.at[0], s.at[1], 1.5) : -1;
    p = i >= 0 ? { x: G.xs[i], y: G.ys[i], node: i } : { x: s.at[0], y: s.at[1], node: -1 };
    P.set(s.id, p); return p;
  };
  // 两站之间的线位：点列（含两端）、长度（格）、隧道与桥梁占比；没有可用的铁路数据时按直线
  const pathCache = new WeakMap();
  T.railBetween = function (R, A, B) {
    let C = pathCache.get(R); if (!C) pathCache.set(R, C = new Map());
    const k = A.id + '>' + B.id; let r = C.get(k); if (r) return r;
    const pa = T.stopPos(R, A), pb = T.stopPos(R, B), G = railGraph(R), straight = Math.hypot(pb.x - pa.x, pb.y - pa.y);
    let pts = null, tun = 0, bri = 0, len = 0;
    if (pa.node >= 0 && pb.node >= 0) {
      const nodes = shortest(G, pa.node, pb.node);
      if (nodes && nodes.length >= 2) {
        pts = nodes.map(function (v) { return [G.xs[v], G.ys[v]]; });
        for (let i = 0; i + 1 < nodes.length; i++) {
          const a = G.adj[nodes[i]]; let d = 0, f = 0;
          for (let q = 0; q < a.length; q += 3) if (a[q] === nodes[i + 1]) { d = a[q + 1]; f = a[q + 2]; break; }
          len += d; if (f & 2) tun += d; else if (f & 1) bri += d;
        }
        if (len > straight * 2.2 + 1) { pts = null; len = 0; tun = 0; bri = 0; }   // 绕得太远多半是数据断开，改用直线
      }
    }
    if (!pts) { pts = [[pa.x, pa.y], [pb.x, pb.y]]; len = straight * 1.08; }
    r = { pts: pts, len: len, tun: len > 0 ? tun / len : 0, bri: len > 0 ? bri / len : 0, km: len * CM.CFG.CELL_M / 1000 };
    C.set(k, r); return r;
  };
  // 控制点：Douglas–Peucker 简化（约 10 m），去掉站台直线段以内的点
  const simplify = function (pts, eps) {
    if (pts.length <= 2) return pts.slice();
    const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1;
    const st = [[0, pts.length - 1]];
    while (st.length) {
      const q = st.pop(), a = pts[q[0]], b = pts[q[1]]; let md = -1, mi = -1;
      for (let i = q[0] + 1; i < q[1]; i++) { const d = U.distToSeg(pts[i][0], pts[i][1], a[0], a[1], b[0], b[1]); if (d > md) { md = d; mi = i; } }
      if (md > eps) { keep[mi] = 1; st.push([q[0], mi], [mi, q[1]]); }
    }
    return pts.filter(function (p, i) { return keep[i]; });
  };
  const bendsOf = function (pts) {
    const cut = CM.CFG.metro.platformHalfM / CM.CFG.CELL_M + 0.12, A = pts[0], B = pts[pts.length - 1];
    return simplify(pts, 0.04).slice(1, -1).filter(function (p) { return U.dist(p[0], p[1], A[0], A[1]) > cut && U.dist(p[0], p[1], B[0], B[1]) > cut; }).map(function (p) { return [+p[0].toFixed(3), +p[1].toFixed(3)]; });
  };
  const typeOf = function (R, r, k) { if (R.types && R.types[k]) return R.types[k]; return r.tun > 0.5 ? 'underground' : r.bri > 0.5 ? 'elevated' : 'surface'; };

  // ---------- 线网里的接管状态（由线网推出，按线网对象缓存） ----------
  const covCache = new WeakMap();
  T.covered = function (net, R) {
    let C = covCache.get(net); if (!C) covCache.set(net, C = new Map());
    let s = C.get(R.id); if (s) return s;
    s = new Set();
    for (const id in net.segments) { const sg = net.segments[id]; if (sg.tk === R.id && sg.tkE) for (const k of sg.tkE) s.add(k); }
    C.set(R.id, s); return s;
  };
  // 已接管的铁路线位（v3.1 玩家建议：接管后的区段上不再跑背景列车）：已接管区间的线位按格分桶，
  // 背景交通的铁路折线上离线位 60 m 以内、走向大致平行的点被剔除（同一走廊的并行线位一并剔除，交叉而过的铁路不受影响）。
  // sig 随接管的区段变化，背景列车据此重排线路
  const takenCache = new WeakMap();
  T.takenRail = function (net) {
    const lines = T.list(); if (!net || !lines.length) return null;
    const c = takenCache.get(net); if (c && c.lines === lines) return c.v;
    const segs = [], bk = new Map(), sig = [];
    for (const R of lines) {
      const cov = T.covered(net, R); if (!cov.size) continue;
      const G = T.graph(R);
      G.edges.forEach(function (e) {
        if (!cov.has(e.k)) return;
        const pts = T.railBetween(R, G.st.get(e.a), G.st.get(e.b)).pts;
        for (let i = 0; i + 1 < pts.length; i++) {
          const A = pts[i], B = pts[i + 1], k = segs.length; segs.push([A[0], A[1], B[0], B[1]]);
          for (let gx = Math.floor(Math.min(A[0], B[0]) - 0.3); gx <= Math.floor(Math.max(A[0], B[0]) + 0.3); gx++) for (let gy = Math.floor(Math.min(A[1], B[1]) - 0.3); gy <= Math.floor(Math.max(A[1], B[1]) + 0.3); gy++) { const q = gx * 65536 + gy; let l = bk.get(q); if (!l) bk.set(q, l = []); l.push(k); }
        }
      });
      sig.push(R.id + ':' + Array.from(cov).sort().join(','));
    }
    const v = segs.length ? { sig: sig.join('|'), has: function (x, y, dx, dy) {
      const l = bk.get(Math.floor(x) * 65536 + Math.floor(y)); if (!l) return false;
      const dl = Math.hypot(dx, dy) || 1;
      for (const k of l) {
        const q = segs[k]; if (U.distToSeg(x, y, q[0], q[1], q[2], q[3]) > 0.24) continue;
        const ex = q[2] - q[0], ey = q[3] - q[1], el = Math.hypot(ex, ey) || 1;
        if (Math.abs((dx * ex + dy * ey) / (dl * el)) > 0.82) return true;
      }
      return false;
    } } : null;
    takenCache.set(net, { lines: lines, v: v }); return v;
  };
  T.stationOf = function (net, R, stopId) { for (const id in net.stations) { const s = net.stations[id]; if (s.tk === R.id && s.tkStop === stopId) return id; } return null; };
  const edgeKm = function (R, e) { const G = T.graph(R); return T.railBetween(R, G.st.get(e.a), G.st.get(e.b)).km; };
  // 已接管、可接管的里程（当年已通车的区间）
  T.stats = function (net, R, t) {
    const G = T.graph(R), cov = T.covered(net, R); let all = 0, taken = 0, n = 0;
    G.edges.forEach(function (e) { if (!edgeOpen(e, t)) return; const km = edgeKm(R, e); all += km; if (cov.has(e.k)) { taken += km; n++; } });
    return { all: all, taken: taken, edges: n, frac: all > 0 ? taken / all : 0 };
  };
  // 背景交通里扣掉的比例（与地图数据 bgCut 相乘）：方式选择读这个值，同一批乘客不在背景铁路和地铁里重复计算
  const cutCache = new WeakMap();
  T.bgCut = function (net, t) {
    const lines = T.list();
    if (!net || !lines.length) return 0;
    const month = Math.floor(t * 12 + 1e-6), cached = cutCache.get(net);
    if (cached && cached.lines === lines && cached.month === month) return cached.value;
    let c = 0; for (const R of lines) if (R.bgCut > 0) c += R.bgCut * T.stats(net, R, t).frac;
    const value = U.clamp(c, 0, 0.9);
    cutCache.set(net, { lines: lines, month: month, value: value }); return value;
  };

  // ---------- 规划：两站之间的路径、区段、车站与费用 ----------
  // 两站之间的简单路径（树状区间只有一条；环线有两个方向；起终点相同为整个环）
  T.paths = function (R, a, b) {
    const G = T.graph(R), out = [];
    if (!G.st.has(a) || !G.st.has(b)) return out;
    if (a === b) { for (const r of G.loops) { const i = r.stops.indexOf(a); if (i < 0) continue; const n = r.stops.length, p = []; for (let j = 0; j <= n; j++) p.push(r.stops[(i + j) % n]); out.push(p); const q = p.slice().reverse(); out.push(q); } return out.slice(0, 1); }
    const seen = new Set([a]), cur = [a];
    const dfs = function (u) {
      if (out.length >= 4) return;
      if (u === b) { out.push(cur.slice()); return; }
      for (const v of G.adj.get(u)) { if (seen.has(v)) continue; seen.add(v); cur.push(v); dfs(v); cur.pop(); seen.delete(v); }
    };
    dfs(a);
    return out.sort(function (p, q) { return p.length - q.length; });
  };
  const money = function (v) { return U.fmtMoney(v); };
  // 同一线网、同一月份、同样选择的结果缓存（页面每次刷新都会调用）；确认接管时重新计算
  const plans = new WeakMap();
  T.plan = function (g, R, a, b, opt) {
    opt = opt || {};
    const pk = [g.mapId, R.id, a, b, opt.dir || 0, opt.join || '', g.netVersion, g.clock.y, g.clock.m, g.fleet ? g.fleet.ver : 0].join(':');
    const cached = plans.get(g);
    if (!opt.fresh && cached && cached.key === pk) return cached.plan;
    const plan = planOf(g, R, a, b, opt);
    plans.set(g, { key: pk, plan: plan });
    return plan;
  };
  const planOf = function (g, R, a, b, opt) {
    const t = g.year(), y = g.clock.y, G = T.graph(R), net = g.net, MM = M(), cov = T.covered(net, R), CFG = CM.CFG;
    const res = { R: R, a: a, b: b, ok: false, error: '', path: null, paths: 0, segs: [], stations: [], km: 0, items: [], total: 0, joins: [], notes: [], dir: opt.dir || 0 };
    if (!T.openAt(R, t)) { res.error = ymText(R.open) + '起才能接管' + R.name; return res; }
    const A = G.st.get(a), B = G.st.get(b);
    if (!A || !B) { res.error = '请选择起点站和终点站'; return res; }
    if (!T.stopOpen(A, t) || !T.stopOpen(B, t)) { res.error = (T.stopOpen(A, t) ? B : A).n + '站现在还没有开通'; return res; }
    const all = T.paths(R, a, b);
    if (!all.length) { res.error = a === b ? '起点和终点是同一座车站（只有环线可以整圈接管）' : '这两座车站之间没有连续的铁路'; return res; }
    // 每条候选路径：区间是否都已通车、都没接管
    const ok = function (p) { for (let i = 0; i + 1 < p.length; i++) { const e = G.edges.get(ekey(p[i], p[i + 1])); if (!e || !edgeOpen(e, t)) return 'closed'; if (cov.has(e.k)) return 'taken'; } return ''; };
    const valid = all.filter(function (p) { return !ok(p); });
    res.paths = valid.length;
    if (!valid.length) { const why = ok(all[0]); res.error = why === 'taken' ? '这段铁路里有区段已经接管：请把起终点选在未接管的区段两端' : '这段铁路还有区段没有通车'; return res; }
    const path = valid[Math.min(res.dir, valid.length - 1)]; res.path = path;
    // 区段：相邻的已开通车站之间（没开站的中间站只是经过）
    const stops = path.filter(function (id, i) { return i === 0 || i === path.length - 1 || T.stopOpen(G.st.get(id), t); });
    let j = 0;
    for (let i = 0; i + 1 < stops.length; i++) {
      const SA = G.st.get(stops[i]), SB = G.st.get(stops[i + 1]), edges = [];
      // 线位：沿路径逐个区间拼起来（经过未开站的中间站），方向按路径顺序
      let pts = [], km = 0, tun = 0, bri = 0;
      while (j + 1 < path.length) {
        const u = path[j], v = path[j + 1], r = T.railBetween(R, G.st.get(u), G.st.get(v));
        edges.push(ekey(u, v)); pts = pts.length ? pts.concat(r.pts.slice(1)) : r.pts.slice(); km += r.km; tun += r.tun * r.km; bri += r.bri * r.km;
        j++; if (path[j] === stops[i + 1]) break;
      }
      const lenK = km || 1e-9, type = typeOf(R, { tun: tun / lenK, bri: bri / lenK }, edges.length === 1 ? edges[0] : '');
      res.segs.push({ A: SA.id, B: SB.id, edges: edges, pts: bendsOf(pts), type: type, km: km });
      res.km += km;
    }
    // 车站：已接管的边界站沿用，其余新建；建设方式取线位（隧道、高架）或数据指定
    const segAt = function (id) { return res.segs.filter(function (s) { return s.A === id || s.B === id; }); };
    const uniq = stops[0] === stops[stops.length - 1] ? stops.slice(0, -1) : stops;
    for (const id of uniq) {
      const S = G.st.get(id), have = T.stationOf(net, R, id), p = T.stopPos(R, S), adj = segAt(id);
      const type = S.type || (adj.some(function (s) { return s.type === 'surface'; }) ? 'surface' : adj[0] ? adj[0].type : 'surface');
      res.stations.push({ stop: id, id: have, name: S.n, x: +p.x.toFixed(3), y: +p.y.toFixed(3), type: have ? net.stations[have].type : type, size: S.size || R.size || 'L' });
    }
    // 与玩家既有车站的关系：不合并，步行范围内自动换乘
    for (const S of res.stations) {
      if (S.id) continue;
      for (const id in net.stations) { const o = net.stations[id]; if (o.v || o.tk === R.id) continue; const d = U.dist(o.x, o.y, S.x, S.y) * CFG.CELL_M; if (d <= (CFG.walk.transferMaxM || 300)) { res.notes.push(S.name + '：旁边约 ' + Math.round(d / 10) * 10 + ' m 有你的「' + o.name + '」站，两站分开设站，按步行换乘'); break; } }
    }
    // 可以并入的既有线路：这段的边界站已在同一条铁路接管来的线路上（轨道真实连通）。接在端点是延长，接在中间站是支线（如落马洲支线）；
    // 环线不能再接支线，并入后线路形态无效的在确认前就报出来
    const ends = [stops[0], stops[stops.length - 1]];
    if (stops[0] !== stops[stops.length - 1]) for (const lid in net.lines) {
      const L = net.lines[lid]; if (L.tk !== R.id) continue;
      for (const e of ends) { const sid = T.stationOf(net, R, e); if (sid && MM.stationLines(net, sid).indexOf(lid) >= 0 && !res.joins.some(function (j) { return j.lid === lid; })) res.joins.push({ lid: lid, name: L.name, at: net.stations[sid].name }); }
    }
    res.join = opt.join && res.joins.some(function (j) { return j.lid === opt.join; }) ? opt.join : null;
    // 费用：按当年物价（造价指数）。轨道按地面线单价的 km 倍、车站按造价的 station 倍，基础车队按随线配车
    const ci = MM.costIndex(y), kF = R.km != null ? R.km : 0.6, sF = R.station != null ? R.station : 0.5;
    const track = res.km * CFG.cost.trackPerKm.surface * kF * ci;
    res.items.push({ label: '轨道接管与现代化改造 · ' + U.fmtNum(res.km, 1) + ' km（电气化、信号、道岔与线路加固）', amount: track });
    let stc = 0, nNew = 0; for (const S of res.stations) { if (S.id) continue; nNew++; stc += MM.stationCost(S.type, S.size, y) * sF; }
    if (nNew) res.items.push({ label: '车站改造 · ' + nNew + ' 座（月台、闸机与无障碍设施）', amount: stc });
    res.nNew = nNew; res.nKeep = res.stations.length - nNew;
    // 基础车队：在接管后的线网上按随线配车估算（与建设草案同一套规则）
    const built = T.build(g, R, res);
    if (built.error) { res.error = built.error; return res; }
    res.preview = built;
    let fleet = 0; res.fleetAdd = [];
    if (CM.Fleet && g.fleet) {
      const keep = g.draft, ev = { items: [], total: 0, byKind: { construction: 0 }, notes: [] };
      g.draft = { net: built.net, ver: 1, compVer: -1, compiled: null };
      try { CM.Fleet.draftExtra(g, ev); } finally { g.draft = keep; }
      res.fleetAdd = ev.fleetAdd || []; fleet = ev.total;
      for (const it of ev.items) res.items.push({ label: it.label.replace('随线配属列车', '基础车队'), amount: it.amount });
    }
    res.total = track + stc + fleet;
    res.ok = true;
    return res;
  };
  // 接管后的线网（克隆，不改动原线网）
  T.build = function (g, R, P) {
    const MM = M(), net = MM.clone(g.net), at = [g.clock.y, g.clock.m], sid = {};
    for (const S of P.stations) {
      if (S.id) { sid[S.stop] = S.id; continue; }
      const id = MM.newId(net, 's');
      net.stations[id] = { id: id, name: S.name, x: S.x, y: S.y, size: S.size, type: S.type, tk: R.id, tkStop: S.stop, built: at, site: [S.x, S.y] };
      sid[S.stop] = id;
    }
    let lid = P.join;
    if (!lid) {
      const used = new Set(Object.values(net.lines).map(function (L) { return L.name; }));
      let nm = R.lineName || R.short || R.name, k = 2; while (used.has(nm)) nm = (R.lineName || R.short) + ' ' + (k++);
      lid = MM.newLine(net, nm); const L = net.lines[lid];
      if (R.color) L.color = R.color; L.speed = R.speed || 100; L.tk = R.id;
    }
    for (const sg of P.segs) {
      const r = MM.addSegment(net, lid, sid[sg.A], sid[sg.B], sg.pts, sg.type); if (r.error) return { error: r.error };
      const s = net.segments[r.id]; s.tk = R.id; s.tkE = sg.edges.slice(); s.built = at;
    }
    const ln = MM.normalizeLines(net);
    const bad = MM.validate(net); if (bad) return { error: bad };
    const lineNow = Object.keys(net.lines).find(function (k) { return k === lid; }) ? lid : null;
    const tp = lineNow ? MM.lineTopo(net, lineNow) : null;
    if (tp && tp.topo === 'invalid') return { error: tp.reason || '接管后的线路形态无效' };
    return { net: net, lid: lineNow, notes: ln };
  };
  // 确认接管：一次付清，立即投入运营（与确认建设草案相同的收尾：重新编译、随线配车、重算交通、成长回放与纪事）
  T.can = function (g, P) {
    if (!P || !P.ok) return { ok: false, reason: P ? P.error : '请选择区间' };
    if (g.draft) return { ok: false, reason: '接管确认后立即生效：请先确认或放弃当前的建设草案' };
    if (g.jumping || g.pending) return { ok: false, reason: '正在结算，请稍候' };
    if (!g.econ.canAffordBuild(P.total)) return { ok: false, reason: '资金不足：需要 ' + money(P.total) + '，当前一般资金 ' + money(g.econ.funds) + (g.econ.capex > 0.5 ? ' + 建设专项资金 ' + money(g.econ.capex) : '') };
    return { ok: true };
  };
  T.apply = function (g, R, a, b, opt) {
    const P = T.plan(g, R, a, b, Object.assign({ fresh: true }, opt)), can = T.can(g, P); if (!can.ok) return { error: can.reason };
    const B = P.preview, MM = M(), A0 = P.stations[0], Z0 = P.stations[P.stations.length - 1];
    const span = A0.name + '—' + (P.a === P.b ? A0.name + '（整圈）' : Z0.name);
    g.econ.spendBuild({ construction: P.total }, '既有铁路接管与现代化改造：' + R.name + ' ' + span, { y: g.clock.y, m: g.clock.m, d: g.clock.d });
    const before = g.compiled, netBefore = g.net;
    g.net = B.net; g.netVersion++; g.rev++;
    g.compiled = MM.compile(g.net, g.city);
    if (CM.Fleet && g.fleet) { CM.Fleet.applyAdd(g, P.fleetAdd); CM.Fleet.sync(g); g.fleet.ver++; }
    if (CM.OpsAlerts) { try { CM.OpsAlerts.restructure(g, netBefore); } catch (e) { console.error(e); } }
    g.model.cancelPredict();
    g.model.setNetwork(g.compiled);
    const lines = B.lid ? [B.lid] : [];
    g._impactPlan = { before: before, version: g.netVersion, lines: lines, cost: P.total, summary: '接管 ' + R.short + ' ' + span };
    g.impactReport = { status: 'waiting', version: g.netVersion, at: [g.clock.y, g.clock.m] };
    const L = B.lid && g.net.lines[B.lid];
    g.logEvent({ tag: '建设', title: '接管' + R.short + '：' + span, desc: U.fmtNum(P.km, 1) + ' km、' + P.stations.length + ' 座车站' + (P.nKeep ? '（沿用 ' + P.nKeep + ' 座已接管车站）' : '') + '，完成现代化改造后' + (P.join ? '并入' : '作为') + (L ? L.name : '新线路') + '投入运营，费用 ' + money(P.total) + '。' });
    if (CM.Milestones) CM.Milestones.onNetwork(g);
    g.tasks?.quickCheck?.(g).forEach(o => g.logTask(o));
    g.emit('network'); g.emit('draft');
    g.emit('toast', { kind: 'good', text: '已接管' + R.short + ' ' + span + '，立即投入运营（' + money(P.total) + '）' });
    g.emit('autosave', 'build');
    return { ok: true, lid: B.lid };
  };

  // ---------- 地铁芯「铁路接管」（v3.0 玩家反馈：界面放进地铁芯，简洁一些） ----------
  // 一张概况卡（已接管里程、可接管里程、开放时间），一张线路小地图（按真实走向画出整条铁路，点两座车站选区间），
  // 选好后一张方案卡（费用、投入运营方式、确认），规则与史实收在最后的折叠栏里
  const SVGNS = 'http://www.w3.org/2000/svg';
  const esc = function (s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  // 线路小地图（v3.0 玩家反馈：要有真实地理底图、能平滑缩放）：底图是当年的地理（水面与尚未填出的海、河流、绿地、已通车的主要道路），
  // 低透明度显示；上面按同一比例画整条铁路，颜色区分已接管、可接管、未通车与选中的区间。滚轮或双指平滑缩放、拖动平移，站名和线宽不随缩放变大
  const frameCache = new WeakMap();
  const frameOf = function (R) {
    let F = frameCache.get(R); if (F) return F;
    const G = T.graph(R); let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    G.edges.forEach(function (e) { for (const p of T.railBetween(R, G.st.get(e.a), G.st.get(e.b)).pts) { x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]); } });
    const W = 560, H0 = (y1 - y0) > (x1 - x0) ? 520 : 380, pad = 46, sc = Math.min((W - 2 * pad) / Math.max(1e-6, x1 - x0), (H0 - 2 * pad) / Math.max(1e-6, y1 - y0)), H = Math.round((y1 - y0) * sc + 2 * pad);
    const ox = pad + (W - 2 * pad - (x1 - x0) * sc) / 2;
    F = { W: W, H: H, sc: sc, X: function (x) { return ox + (x - x0) * sc; }, Y: function (y) { return pad + (y - y0) * sc; }, cell: [x0 - ox / sc, y0 - pad / sc, x0 + (W - ox) / sc, y0 + (H - pad) / sc] };
    frameCache.set(R, F); return F;
  };
  // 地理底图（按年份缓存：填海和道路通车会变）：在底图坐标里预先做成 Path2D，画在小地图下面的画布上，缩放时按视图重画，界面里不放大段矢量
  const bgCache = new Map();
  const bgPaths = function (g, R, F) {
    const yr = Math.floor(g.year()), key = g.mapId + ':' + R.id + ':' + yr; if (bgCache.has(key)) return bgCache.get(key);
    const Geo = CM.Geo, city = g.city, cw = F.cell, P = { green: [], water: [], rivers: [], r3: new Path2D(), r4: new Path2D() };
    const hits = function (bb) { return bb && bb[2] >= cw[0] && bb[0] <= cw[2] && bb[3] >= cw[1] && bb[1] <= cw[3]; };
    const add = function (path, p, closed) { const q = []; for (let k = 0; k + 1 < p.length; k += 2) q.push([F.X(p[k]), F.Y(p[k + 1])]); const z = simplify(q, 0.15); if (z.length < 2) return false; path.moveTo(z[0][0], z[0][1]); for (let i = 1; i < z.length; i++) path.lineTo(z[i][0], z[i][1]); if (closed) path.closePath(); return true; };
    const polys = function (feats, out) { for (const ft of feats || []) { if (!hits(ft.bbox)) continue; const p = new Path2D(); let any = false; for (const r of ft.rings) any = add(p, r.p, true) || any; if (any) out.push(p); } };
    if (Geo && Geo.water) {
      polys([].concat(Geo.reserves || [], Geo.woods || [], Geo.parks || []), P.green);
      polys(Geo.water, P.water); if (city && city.reclaimWater) polys(city.reclaimWater(), P.water);
      for (const r of Geo.waterLines || []) { if (!hits(r.bbox)) continue; const p = new Path2D(); if (add(p, r.p, false)) P.rivers.push({ p: p, w: Math.max(0.05, r.w) * F.sc }); }
    }
    for (const gr of (city && city.roadGroups) || []) { if (gr.cls < 3 || (gr.year != null && gr.year > yr) || !hits(gr.bbox)) continue; for (const p of gr.ways) add(gr.cls >= 4 ? P.r4 : P.r3, p, false); }
    if (bgCache.size > 6) bgCache.delete(bgCache.keys().next().value);
    bgCache.set(key, P); return P;
  };
  // 既有地铁（v3.0 玩家反馈：小地图上低透明度显示已建成的线网）：每条线路一条 Path2D、车站一组圆点，按线网和铁路缓存；接管来的区段由上层的铁路图画
  const metroCache = new WeakMap();
  const metroPaths = function (g, R, F) {
    const net = g.net;
    let cached = metroCache.get(net);
    if (!cached || cached.version !== g.netVersion) { cached = { version: g.netVersion, paths: new Map() }; metroCache.set(net, cached); }
    const paths = cached.paths;
    if (paths.has(R)) return paths.get(R);
    const MM = M(), byLine = new Map();
    for (const id in net.segments) {
      const sg = net.segments[id]; if (sg.tk) continue;
      const L = net.lines[sg.line]; if (!L || !net.stations[sg.a] || !net.stations[sg.b]) continue;
      let o = byLine.get(sg.line); if (!o) { o = { line: L, p: new Path2D() }; byLine.set(sg.line, o); }
      const pts = MM.segGeom(net, sg, g.city).pts; if (!pts || pts.length < 2) continue;
      const q = simplify(pts.map(function (p) { return [F.X(p[0]), F.Y(p[1])]; }), 0.2);
      o.p.moveTo(q[0][0], q[0][1]); for (let i = 1; i < q.length; i++) o.p.lineTo(q[i][0], q[i][1]);
    }
    const dots = [];
    for (const id in net.stations) { const s0 = net.stations[id]; if (s0.v || s0.tk) continue; dots.push([F.X(s0.x), F.Y(s0.y)]); }
    const result = { lines: Array.from(byLine.values()), dots: dots };
    paths.set(R, result); return result;
  };
  // 显卡小地图（v3.1）：底图（绿地、水面、河流、道路、既有地铁）与主地图一样由显卡按矢量绘制（groundgl.js 的构件），缩放、拖动时始终清楚，
  // 不再先拉伸缓存图、停下再重画。WebGL 画布是单例，各次打开、每次刷新页面时移到新的小地图里复用；几何按地图、年份、地形与道路版本、线网版本缓存。
  // WebGL 不可用时用下面的 Canvas 矢量底图
  T.mapView = function (g, R, sel, plan, view, onPick) {
    const G = T.graph(R), t = g.year(), cov = T.covered(g.net, R), on = new Set(), F = frameOf(R), W = F.W, H = F.H;
    if (plan && plan.path) for (let i = 0; i + 1 < plan.path.length; i++) on.add(ekey(plan.path[i], plan.path[i + 1]));
    const f1 = function (v) { return v.toFixed(1); };
    let lines = '';
    const L = []; G.edges.forEach(function (e) { L.push({ e: e, k: on.has(e.k) ? 'sel' : cov.has(e.k) ? 'taken' : edgeOpen(e, t) ? 'open' : 'off' }); });
    const order = { off: 0, open: 1, taken: 2, sel: 3 }; L.sort(function (a, b) { return order[a.k] - order[b.k]; });
    for (const x of L) { const pts = simplify(T.railBetween(R, G.st.get(x.e.a), G.st.get(x.e.b)).pts.map(function (p) { return [F.X(p[0]), F.Y(p[1])]; }), 0.25); lines += '<polyline class="tk-l ' + x.k + '" points="' + pts.map(function (p) { return f1(p[0]) + ',' + f1(p[1]); }).join(' ') + '"' + (x.k === 'taken' ? ' style="stroke:' + esc(R.color || '#1f9d63') + '"' : '') + '/>'; }
    // 站名：环线放在圈外，其余放在线路一侧（竖向的线放右侧、横向的放上方），和已放的站名或车站重叠时换到另一侧或上下错开（按底图比例算一次，放大后只会更松）
    const ends = plan && plan.path ? [plan.path[0], plan.path[plan.path.length - 1]] : [];
    const P0 = R.stops.map(function (q) { const p = T.stopPos(R, q); return { s: q, x: F.X(p.x), y: F.Y(p.y), open: T.stopOpen(q, t) }; });
    const at = new Map(); for (const q of P0) at.set(q.s.id, q);
    const dots = P0.filter(function (q) { return q.open; }), placed = [], loop = G.loops.length > 0;
    let cx = 0, cy = 0; for (const q of P0) { cx += q.x; cy += q.y; } cx /= P0.length; cy /= P0.length;
    const hitBox = function (b, me) {
      for (const o of placed) if (b.x0 < o.x1 && b.x1 > o.x0 && b.y0 < o.y1 && b.y1 > o.y0) return true;
      for (const q of dots) if (q !== me && q.x > b.x0 - 5 && q.x < b.x1 + 5 && q.y > b.y0 - 5 && q.y < b.y1 + 5) return true;
      return b.x0 < 2 || b.x1 > W - 2 || b.y0 < 2 || b.y1 > H - 2;
    };
    let stops = '';
    for (const q of P0) {
      const s = q.s, mine = !!T.stationOf(g.net, R, s.id), picked = s.id === sel.a || s.id === sel.b || ends.indexOf(s.id) >= 0;
      if (!q.open) { stops += '<g class="tk-st off" data-x="' + f1(q.x) + '" data-y="' + f1(q.y) + '"><circle class="tk-p off" r="3"/><title>' + esc(s.n + '：' + (s.y0 && t < yof(s.y0) ? ymText(s.y0) + '开站' : '已停用')) + '</title></g>'; continue; }
      let nx, ny;
      if (loop) { nx = q.x - cx; ny = q.y - cy; }
      else { const nb = G.adj.get(s.id); let tx = 0, ty = 0; nb.forEach(function (id, i) { const o = at.get(id), dd = Math.hypot(o.x - q.x, o.y - q.y) || 1; tx += (o.x - q.x) / dd * (i ? -1 : 1); ty += (o.y - q.y) / dd * (i ? -1 : 1); }); nx = -ty; ny = tx; if (Math.abs(nx) > 0.3 ? nx < 0 : ny > 0) { nx = -nx; ny = -ny; } }
      const nl = Math.hypot(nx, ny) || 1; nx /= nl; ny /= nl;
      const wTxt = s.n.length * 11.5 + 2, cands = [[nx, ny, 0], [-nx, -ny, 0], [nx, ny, 13], [nx, ny, -13], [-nx, -ny, 13], [-nx, -ny, -13]];
      let best = null;
      for (const c of cands) {
        const lx = c[0] * 11, ly = c[1] * 11 + 4 + c[2], anchor = c[0] > 0.35 ? 'start' : c[0] < -0.35 ? 'end' : 'middle';
        const bx0 = q.x + (anchor === 'start' ? lx : anchor === 'end' ? lx - wTxt : lx - wTxt / 2), b = { x0: bx0, x1: bx0 + wTxt, y0: q.y + ly - 11, y1: q.y + ly + 3, lx: lx, ly: ly, anchor: anchor };
        if (!best) best = b;
        if (!hitBox(b, q)) { best = b; break; }
      }
      placed.push(best);
      stops += '<g class="tk-st' + (picked ? ' on' : '') + (mine ? ' mine' : '') + '" data-x="' + f1(q.x) + '" data-y="' + f1(q.y) + '" data-stop="' + esc(s.id) + '" tabindex="0" role="button" aria-label="' + esc(s.n) + '">' +
        '<circle class="tk-hit" r="13"/><circle class="tk-p" r="' + (picked ? 7 : 5) + '"' + (mine && !picked ? ' style="stroke:' + esc(R.color || '#1f9d63') + '"' : '') + '/>' +
        '<text x="' + f1(best.lx) + '" y="' + f1(best.ly) + '" text-anchor="' + best.anchor + '">' + esc(s.n) + '</text></g>';
    }
    const svg = '<svg class="tk-svg" viewBox="0 0 ' + W + ' ' + H + '" xmlns="' + SVGNS + '" role="group">' +
      '<g class="tk-zoom">' + lines + '</g><g class="tk-stops">' + stops + '</g></svg>';
    const el = h('div', { class: 'tk-map', html: svg });
    const cv = document.createElement('canvas');
    let BG = null, MT = null;
    cv.className = 'tk-bgc'; el.insertBefore(cv, el.firstChild);
    const svgEl = el.querySelector('svg'), zg = svgEl.querySelector('.tk-zoom'), stG = Array.from(svgEl.querySelectorAll('.tk-st'));
    const base0 = stG.map(function (n) { return [+n.getAttribute('data-x'), +n.getAttribute('data-y')]; });
    // 视图：屏幕 = 底图 × k + (tx, ty)；k 在 1–10 之间，平移不让地图离开画框
    const v = view || { k: 1, tx: 0, ty: 0 }, goal = { k: v.k, tx: v.tx, ty: v.ty };
    const clamp = function (o) { o.k = U.clamp(o.k, 1, 10); o.tx = U.clamp(o.tx, W - W * o.k, 0); o.ty = U.clamp(o.ty, H - H * o.k, 0); return o; };
    // 底图画布：底色、低透明度的绿地、水面、河流与道路；道路线宽不随缩放变粗
    // 缩放与拖动时（v3.1 玩家反馈：选区间时缩放、移动卡顿）不再每帧重画整张矢量底图：先画一张整条线路视图的两倍清晰度底图，
    // 再叠上次停下时画好的清晰底图，按当前视图拉伸平移；停下约 0.15 秒后才按当前视图重画清晰底图
    let col = null, theme = null, full = null, base = null, sharpT = 0;
    const vector = function (c, pw, ph, s0, k, tx, ty) {
      const sk = s0 * k, px = (pw / el.clientWidth || 1) / sk;
      c.setTransform(1, 0, 0, 1, 0, 0); c.globalAlpha = 1; c.fillStyle = col.land; c.fillRect(0, 0, pw, ph);
      c.setTransform(sk, 0, 0, sk, s0 * tx, s0 * ty); c.globalAlpha = 0.55; c.lineJoin = 'round'; c.lineCap = 'round';
      c.fillStyle = col.green; for (const p of BG.green) c.fill(p, 'evenodd');
      c.fillStyle = col.water; for (const p of BG.water) c.fill(p, 'evenodd');
      c.strokeStyle = col.water; for (const q of BG.rivers) { c.lineWidth = Math.max(q.w, px); c.stroke(q.p); }
      c.strokeStyle = col.road; c.lineWidth = 0.8 * px; c.stroke(BG.r3); c.lineWidth = 1.5 * px; c.stroke(BG.r4);
      // 既有地铁：线宽与站点大小不随缩放变化
      c.globalAlpha = 0.42; c.lineWidth = 3 * px;
      const AXc = CM.Accessibility;
      for (const o of MT.lines) { c.strokeStyle = AXc && AXc.line ? AXc.line(o.line) : o.line.color; c.stroke(o.p); }
      c.fillStyle = col.land; c.strokeStyle = '#6b7280'; c.lineWidth = 1.2 * px;
      for (const d of MT.dots) { c.beginPath(); c.arc(d[0], d[1], 2.6 * px, 0, Math.PI * 2); c.fill(); c.stroke(); }
      c.globalAlpha = 1;
    };
    const readCol = function () { if (!col) { const cs = getComputedStyle(el); col = { land: cs.getPropertyValue('--tk-land').trim() || '#f6f3ec', water: cs.getPropertyValue('--tk-water').trim() || '#cfe3f3', green: cs.getPropertyValue('--tk-green').trim() || '#dcebd3', road: cs.getPropertyValue('--tk-road').trim() || '#b9b2a5' }; } return col; };
    const paintBg = function (fast) {
      const rw = el.clientWidth, rh = el.clientHeight; if (!rw || !el.isConnected) return false;
      if (!BG) { BG = bgPaths(g, R, F); MT = metroPaths(g, R, F); }
      const dpr = Math.min(2, window.devicePixelRatio || 1), pw = Math.round(rw * dpr), ph = Math.round(rh * dpr), s0 = pw / W;
      if (cv.width !== pw || cv.height !== ph) { cv.width = pw; cv.height = ph; full = base = null; }
      const palette = document.documentElement.dataset.theme;
      if (theme !== palette) { theme = palette; col = full = base = null; }
      readCol();
      const c = cv.getContext('2d');
      if (fast && base) {
        c.setTransform(1, 0, 0, 1, 0, 0); c.fillStyle = col.land; c.fillRect(0, 0, pw, ph);
        c.setTransform(v.k, 0, 0, v.k, s0 * v.tx, s0 * v.ty); c.drawImage(base, 0, 0, pw, ph);
        if (full) { const m = v.k / full.k; c.setTransform(m, 0, 0, m, s0 * (v.tx - full.tx * m), s0 * (v.ty - full.ty * m)); c.drawImage(full.c, 0, 0); }
        c.setTransform(1, 0, 0, 1, 0, 0);
        clearTimeout(sharpT); sharpT = setTimeout(function () { if (el.isConnected) paintBg(false); }, 150);
        return true;
      }
      if (!base) { base = document.createElement('canvas'); base.width = pw * 2; base.height = ph * 2; vector(base.getContext('2d'), pw * 2, ph * 2, s0 * 2, 1, 0, 0); }
      vector(c, pw, ph, s0, v.k, v.tx, v.ty);
      if (!full) full = { c: document.createElement('canvas') };
      if (full.c.width !== pw || full.c.height !== ph) { full.c.width = pw; full.c.height = ph; }
      const fc = full.c.getContext('2d'); fc.setTransform(1, 0, 0, 1, 0, 0); fc.clearRect(0, 0, pw, ph); fc.drawImage(cv, 0, 0);
      full.k = v.k; full.tx = v.tx; full.ty = v.ty;
      return true;
    };
    const paint = function (fast) {
      if (!paintBg(fast)) requestAnimationFrame(function () { paintBg(false); });
      zg.setAttribute('transform', 'translate(' + f1(v.tx) + ' ' + f1(v.ty) + ') scale(' + v.k.toFixed(4) + ')');
      for (let i = 0; i < stG.length; i++) stG[i].setAttribute('transform', 'translate(' + f1(base0[i][0] * v.k + v.tx) + ' ' + f1(base0[i][1] * v.k + v.ty) + ')');
      el.classList.toggle('zoomed', v.k > 1.01);
    };
    let anim = 0;
    const step = function () {
      anim = 0; const a = 0.28;
      v.k += (goal.k - v.k) * a; v.tx += (goal.tx - v.tx) * a; v.ty += (goal.ty - v.ty) * a;
      if (Math.abs(goal.k - v.k) < 0.002 && Math.abs(goal.tx - v.tx) < 0.2 && Math.abs(goal.ty - v.ty) < 0.2) { v.k = goal.k; v.tx = goal.tx; v.ty = goal.ty; }
      else anim = requestAnimationFrame(step);
      paint(true);
    };
    const animate = function () { clamp(goal); if (!anim) anim = requestAnimationFrame(step); };
    const toSvg = function (cx0, cy0) { const r = svgEl.getBoundingClientRect(); return [(cx0 - r.left) * W / (r.width || 1), (cy0 - r.top) * H / (r.height || 1)]; };
    const zoomAt = function (p, f) { const k2 = U.clamp(goal.k * f, 1, 10), m = k2 / goal.k; goal.tx = p[0] - (p[0] - goal.tx) * m; goal.ty = p[1] - (p[1] - goal.ty) * m; goal.k = k2; animate(); };
    svgEl.addEventListener('wheel', function (e) { e.preventDefault(); zoomAt(toSvg(e.clientX, e.clientY), Math.exp(-e.deltaY * (e.deltaMode ? 0.05 : 0.0016))); }, { passive: false });
    svgEl.addEventListener('dblclick', function (e) { e.preventDefault(); zoomAt(toSvg(e.clientX, e.clientY), 2); });
    // 拖动平移、双指缩放；移动超过 4 px 才算拖动，短按仍是选站
    const ptr = new Map(); let moved = false, pinch = null;
    svgEl.addEventListener('pointerdown', function (e) { ptr.set(e.pointerId, [e.clientX, e.clientY]); moved = false; if (ptr.size === 2) { const q = Array.from(ptr.values()); pinch = { d: Math.hypot(q[0][0] - q[1][0], q[0][1] - q[1][1]) || 1 }; } });
    svgEl.addEventListener('pointermove', function (e) {
      const o = ptr.get(e.pointerId); if (!o) return;
      const r = svgEl.getBoundingClientRect(), sx = W / (r.width || 1), dx = e.clientX - o[0], dy = e.clientY - o[1];
      if (ptr.size === 1) { if (!moved && Math.hypot(dx, dy) < 4) return; if (!moved) { moved = true; try { svgEl.setPointerCapture(e.pointerId); } catch (er) { /* 指针已结束 */ } } goal.tx += dx * sx; goal.ty += dy * sx; clamp(goal); v.tx = goal.tx; v.ty = goal.ty; paint(true); }
      ptr.set(e.pointerId, [e.clientX, e.clientY]);
      if (ptr.size === 2 && pinch) { moved = true; const q = Array.from(ptr.values()), d = Math.hypot(q[0][0] - q[1][0], q[0][1] - q[1][1]) || 1; zoomAt(toSvg((q[0][0] + q[1][0]) / 2, (q[0][1] + q[1][1]) / 2), d / pinch.d); pinch.d = d; }
    });
    const up = function (e) { ptr.delete(e.pointerId); if (ptr.size < 2) pinch = null; };
    svgEl.addEventListener('pointerup', up); svgEl.addEventListener('pointercancel', up);
    svgEl.addEventListener('click', function (e) { if (moved) { moved = false; e.stopPropagation(); return; } const n = e.target.closest && e.target.closest('[data-stop]'); if (n) onPick(n.getAttribute('data-stop')); });
    svgEl.addEventListener('keydown', function (e) { if (e.key !== 'Enter' && e.key !== ' ') return; const n = e.target.closest && e.target.closest('[data-stop]'); if (n) { e.preventDefault(); onPick(n.getAttribute('data-stop')); } });
    const btn = function (txt, tip, fn) { return h('button', { class: 'tk-zb', 'data-tip': tip, 'aria-label': tip, onclick: fn }, txt); };
    el.appendChild(h('div', { class: 'tk-zctl' },
      btn('+', '放大', function () { zoomAt([W / 2, H / 2], 1.6); }), btn('−', '缩小', function () { zoomAt([W / 2, H / 2], 1 / 1.6); }),
      btn('⤢', '显示整条线路', function () { goal.k = 1; goal.tx = 0; goal.ty = 0; animate(); })));
    paint();
    el.view = v;
    return el;
  };
  // 视图：env 由地铁芯提供（kpi、cardHead、刷新、提示）
  T.opsView = function (g, ui, env) {
    const list = T.list(), t = g.year(), h0 = h;
    if (!list.length) return [h0('section', { class: 'mc-card' }, env.empty('train', '这张地图没有可以接管的既有铁路'))];
    const st = ui._tk || (ui._tk = {});
    const R = T.byId(st.rid) || list[0]; if (st.rid !== R.id) { st.rid = R.id; st.a = st.b = null; st.dir = 0; st.join = null; st.view = null; }
    const G = T.graph(R), S = T.stats(g.net, R, t), open = T.openAt(R, t), redraw = env.redraw;
    const out = [];
    if (list.length > 1) out.push(h0('div', { class: 'mc-tools' }, h0('div', { class: 'seg-ctl sm' }, list.map(function (x) { return h0('button', { class: x === R ? 'on' : '', onclick: function () { ui._tk = { rid: x.id }; redraw(); } }, x.short || x.name); }))));
    // 概况
    const free = S.all - S.taken, full = S.all > 0 && free < 1e-6;
    out.push(h0('section', { class: 'mc-card mc-pad tk-hero' },
      h0('div', { class: 'tk-title' }, h0('i', { class: 'tk-dot', style: { background: R.color || '#1f9d63' } }), h0('b', null, R.name), h0('span', { class: 'tk-tag' + (open ? (full ? ' good' : '') : ' off') }, !open ? ymText(R.open) + '开放' : full ? '已全部接管' : S.taken > 0 ? '部分接管' : '可以接管')),
      h0('p', { class: 'tk-desc' }, R.desc || ''),
      h0('div', { class: 'mc-kpis tk-kpis' },
        env.kpi('已接管', U.fmtNum(S.taken, 1) + ' km', S.edges ? S.edges + ' 个区间' : '还没有接管'),
        env.kpi('可接管', U.fmtNum(Math.max(0, free), 1) + ' km', '共 ' + U.fmtNum(S.all, 1) + ' km 已通车'),
        env.kpi(open ? '已开放' : '开放时间', ymText(R.open), open ? '随时可以接管' : '到时出现事件提示'))));
    // 线路小地图：点两座车站选区间
    let P = null;
    if (open && st.a && st.b) P = T.plan(g, R, st.a, st.b, { dir: st.dir, join: st.join });
    const pick = function (id) {
      if (!open) return;
      const s = G.st.get(id); if (!s || !T.stopOpen(s, t)) return;
      if (!st.a || st.b) { st.a = id; st.b = null; } else st.b = id;
      st.dir = 0; st.join = null; redraw();
    };
    const map = T.mapView(g, R, st, P && P.path ? P : null, st.view || (st.view = { k: 1, tx: 0, ty: 0 }), pick);
    const hint = !open ? ymText(R.open) + '起可以接管。' : full ? '已通车的区段已经全部接管。' : !st.a ? '点地图上的一座车站作为起点。' : !st.b ? '再点一座车站作为终点' + (G.loops.length ? '（点同一座车站是整圈接管）' : '') + '。' : '';
    const legend = h0('div', { class: 'tk-legend' }, h0('span', null, h0('i', { class: 'tk-k taken', style: { background: R.color || '#1f9d63' } }), '已接管'), h0('span', null, h0('i', { class: 'tk-k open' }), '可以接管'), h0('span', null, h0('i', { class: 'tk-k off' }), '未通车'), h0('span', null, h0('i', { class: 'tk-k sel' }), '选中的区间'), h0('span', null, h0('i', { class: 'tk-k metro' }), '已建地铁'), h0('span', { class: 'tk-zhint' }, '滚轮或双指缩放，拖动平移'));
    out.push(h0('section', { class: 'mc-card' }, env.cardHead('选择区间', hint || null, st.a ? h0('button', { class: 'btn sm ghost', onclick: function () { st.a = st.b = null; redraw(); } }, '重选') : null), map, legend));
    // 方案
    if (P) {
      if (!P.ok) out.push(h0('div', { class: 'callout bad' }, P.error));
      else {
        const A0 = G.st.get(P.path[0]), Z0 = G.st.get(P.path[P.path.length - 1]), can = T.can(g, P);
        const dirs = P.paths > 1 ? h0('div', { class: 'seg-ctl sm' }, [0, 1].map(function (d) { const p = T.paths(R, st.a, st.b)[d], via = p && G.st.get(p[Math.floor(p.length / 2)]); return h0('button', { class: (st.dir || 0) === d ? 'on' : '', onclick: function () { st.dir = d; redraw(); } }, '经由' + (via ? via.n : '另一侧')); })) : null;
        const how = P.joins.length ? h0('div', { class: 'seg-ctl sm' }, h0('button', { class: !P.join ? 'on' : '', onclick: function () { st.join = null; redraw(); } }, '新建线路'),
          P.joins.map(function (j) { return h0('button', { class: P.join === j.lid ? 'on' : '', 'data-tip': '轨道在' + j.at + '站相连', onclick: function () { st.join = j.lid; redraw(); } }, '并入' + j.name); })) : h0('span', { class: 'tk-muted' }, '新建「' + (R.lineName || R.short) + '」' + (R.speed ? '，最高 ' + R.speed + ' km/h' : ''));
        out.push(h0('section', { class: 'mc-card tk-plan' },
          env.cardHead('接管方案', A0.n + ' → ' + (P.a === P.b ? A0.n + '（整圈）' : Z0.n), dirs),
          h0('div', { class: 'mc-pad' },
            h0('div', { class: 'tk-sum' },
              h0('div', null, h0('small', null, '里程'), h0('b', null, U.fmtNum(P.km, 1) + ' km')),
              h0('div', null, h0('small', null, '车站'), h0('b', null, String(P.stations.length)), P.nKeep ? h0('span', null, '沿用 ' + P.nKeep + ' 座') : null),
              h0('div', { class: 'big' }, h0('small', null, '一次付清'), h0('b', null, money(P.total)))),
            h0('div', { class: 'tk-items' }, P.items.map(function (it) { return h0('div', null, h0('span', null, it.label), h0('b', null, money(it.amount))); })),
            h0('div', { class: 'tk-row' }, h0('span', { class: 'tk-lab' }, '投入运营'), how),
            P.notes.length ? h0('ul', { class: 'tk-notes' }, P.notes.map(function (n) { return h0('li', null, n); })) : null,
            h0('div', { class: 'tk-go' },
              can.ok ? null : h0('span', { class: 'tk-why' }, can.reason),
              h0('button', { class: 'btn primary', disabled: can.ok ? null : true, onclick: function () {
                const r = T.apply(g, R, st.a, st.b, { dir: st.dir, join: st.join });
                if (r.error) { env.toast(r.error, 'bad'); return; }
                st.a = st.b = null; st.join = null; redraw();
              } }, '确认接管并投入运营')))));
      }
    }
    // 规则与史实（折叠）
    const rules = [
      '费用按当年物价：轨道每公里按地面线造价的 ' + Math.round((R.km != null ? R.km : 0.6) * 100) + '%、车站按造价的 ' + Math.round((R.station != null ? R.station : 0.5) * 100) + '%，加上基础车队。',
      '接管的车站保留原址。可改建、改线、在区间插站或接入新线路。接管的轨道和原车站不可拆除。',
      '接管的车站和你已有的车站各自独立，步行范围内自动形成换乘；在边界站可以和没接管的铁路换乘，你的列车不会开进没接管的区段。',
      '没接管的区段照常作为背景铁路运行；接管的里程按比例从背景交通里扣掉，同一批乘客不会重复计算。',
      '之后的历史事件（新车站开通、线路延伸、运营权变化）只写进纪事，不会改动你接管的线路；新通车的区间可以另行接管。'].concat(R.limits ? [R.limits] : []);
    out.push(h0('details', { class: 'mc-card tk-more' }, h0('summary', null, '接管规则与史实背景'),
      h0('div', { class: 'mc-pad' },
        h0('ul', { class: 'tk-rules' }, rules.map(function (x) { return h0('li', null, x); })),
        R.history && R.history.length ? h0('div', { class: 'tk-his' }, R.history.map(function (x) { return h0('div', null, h0('b', null, ymText(x[0])), h0('span', null, x[1])); })) : null)));
    return out;
  };
})(window.CM);
