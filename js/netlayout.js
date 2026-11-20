'use strict';
// 线路示意图的排版（v2.7，v3.1 重写）：按常见地铁图的做法，线路只走水平、竖直和 45° 斜线，保留实际的方位、走向与站距比例。
// 分三步（v3.1 玩家反馈：线路图把水面、陆地拉扯变形，车站位置怪）：
// ① 等比缩放（scaleMap）：与地理线网同一比例，地形保持真实形状，不做局部放大。
// ② 定方向：换乘站、支线点、终点和两条线实际相交的点（隐形，不是车站）是控制点，控制点之间是走廊。
//    每个控制点先给各条走廊分配出口方向——八个方向各不相同、环绕顺序与实际一致、同一条线穿过时尽量对直；
//    走廊按实际走向化简成几段，每段取一个方向，或在段内折一次，动态规划选出弯折最少、最贴近实际走向的方向序列。
// ③ 定位置：方向固定后反复投影（每段只能沿给定方向伸缩，站距接近实际、不小于下限），同时轻拉回真实位置，挨得太近的走廊互相推开；
//    最后把每条直线段上的车站按实际站距比例排开。车站只在真实位置附近小幅挪动，江海底图只在车站旁贴合这点挪动。
// 结果只取决于线网，不用随机数，同一线网每次排出来都一样。
(function (CM) {
  const DIRS = []; for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4; DIRS.push([Math.round(Math.cos(a) * 1e9) / 1e9, Math.round(Math.sin(a) * 1e9) / 1e9]); }
  const Q = Math.PI / 4;
  const angDiff = function (a, b) { let d = Math.abs(a - b) % (2 * Math.PI); return d > Math.PI ? 2 * Math.PI - d : d; };
  const octDiff = function (a, b) { const d = ((a - b) % 8 + 8) % 8; return d > 4 ? 8 - d : d; };
  const octNear = function (ang) { return ((Math.round(ang / Q) % 8) + 8) % 8; };
  // 弯折代价（按相差几个 45°）：走廊在车站处转弯、控制点处同一条线没对直
  const BEND = [0, 0.3, 1.0, 5, 100];
  const PORT_BEND = [0, 0.45, 1.5, 5, 12];
  const B_IN45 = 0.32, B_IN90 = 1.05, K_FIT = 1.6, PORT_MISS = 6, STUB = 0.12;

  // 两条线实际相交的点（v2.7 玩家反馈：以很小角度相交的两条线会被吸附成平行，交叉点丢失，交叉点两侧的站左右排反）：
  // 不共用车站、实际相交的两段站间连线，交点作为两条线共用的隐形控制点，两段都从交点断开，排版时两条线必须在这一点相交。
  // 几乎重合的交点（v3.1 修复：三条线几乎在同一点相交时，两个交点相距只有几米，排版时先后顺序可能排反，线路在这里来回折、两端车站挤在一起）
  // 距离小于 eps 的交点合并成一个，几条线都经过这一点。返回交点坐标与每段被切开的位置（按段内比例）
  function crossings(edges, gx, gy, eps) {
    const raw = [], cuts = edges.map(function () { return []; }), box = edges.map(function (e) { return [Math.min(gx[e.a], gx[e.b]), Math.min(gy[e.a], gy[e.b]), Math.max(gx[e.a], gx[e.b]), Math.max(gy[e.a], gy[e.b])]; });
    const ori = function (ax, ay, bx, by, cx, cy) { return (bx - ax) * (cy - ay) - (by - ay) * (cx - ax); };
    for (let i = 0; i < edges.length; i++) for (let j = i + 1; j < edges.length; j++) {
      const p = edges[i], q = edges[j], bi = box[i], bj = box[j];
      if (bi[0] > bj[2] || bj[0] > bi[2] || bi[1] > bj[3] || bj[1] > bi[3]) continue;
      if (p.a === q.a || p.a === q.b || p.b === q.a || p.b === q.b) continue;
      const ax = gx[p.a], ay = gy[p.a], bx = gx[p.b], by = gy[p.b], cx = gx[q.a], cy = gy[q.a], dx = gx[q.b], dy = gy[q.b];
      const d1 = ori(ax, ay, bx, by, cx, cy), d2 = ori(ax, ay, bx, by, dx, dy), d3 = ori(cx, cy, dx, dy, ax, ay), d4 = ori(cx, cy, dx, dy, bx, by);
      if (!(d1 * d2 < 0 && d3 * d4 < 0)) continue;
      const t = d3 / (d3 - d4), u = d1 / (d1 - d2);   // 交点在 p 上的比例 t、在 q 上的比例 u
      if (t < 0.02 || t > 0.98 || u < 0.02 || u > 0.98) continue;   // 几乎压在车站上的不算（交给车站本身）
      raw.push({ i: i, j: j, t: t, u: u, x: ax + (bx - ax) * t, y: ay + (by - ay) * t });
    }
    // 合并：并查集，相距小于 eps 的交点归为一组，组的位置取平均；同一段上落在同一组的切口只留一个（比例取平均）
    const par = raw.map(function (_, k) { return k; }), find = function (k) { while (par[k] !== k) k = par[k] = par[par[k]]; return k; };
    for (let p = 0; p < raw.length; p++) for (let q = p + 1; q < raw.length; q++) if (Math.hypot(raw[p].x - raw[q].x, raw[p].y - raw[q].y) < eps) par[find(p)] = find(q);
    const pts = [], idOf = new Map(), cnt = [];
    raw.forEach(function (r, k) { const root = find(k); let v = idOf.get(root); if (v == null) { v = pts.length; idOf.set(root, v); pts.push([0, 0]); cnt.push(0); } pts[v][0] += r.x; pts[v][1] += r.y; cnt[v]++; r.v = v; });
    pts.forEach(function (p, v) { p[0] /= cnt[v]; p[1] /= cnt[v]; });
    const add = function (ei, t, v) { const c = cuts[ei].find(function (o) { return o.v === v; }); if (c) { c.t = (c.t * c.n + t) / (c.n + 1); c.n++; } else cuts[ei].push({ t: t, v: v, n: 1 }); };
    for (const r of raw) { add(r.i, r.t, r.v); add(r.j, r.u, r.v); }
    return { pts: pts, cuts: cuts };
  }

  // ① 等比缩放（v3.1 玩家反馈：陆地和水系不能被拉扯变形）：地形只做整体缩放，比例与地理线网相同——站距中位数约为一个标准站距。
  //    车站在这个位置附近排八方向，江河湖海保持真实形状，只在车站旁随排版的小幅挪动贴合（见 netmap.js residualWarp）。
  //    返回 map(x, y) → 版面坐标，以及版面边框大小
  function scaleMap(edges, unit, W, H) {
    const lens = edges.map(function (e) { return e.geo; }).filter(function (v) { return v > 1e-6; }).sort(function (a, b) { return a - b; });
    const s = unit / Math.max(0.5, lens[lens.length >> 1] || 1);
    const map = function (x, y) { return [x * s, y * s]; };
    map.W = W * s; map.H = H * s; map.unit = unit; map.scale = s;
    return map;
  }

  // 折线化简（Douglas–Peucker），返回保留下来的序号；首尾相同（环）时按到该点的距离
  function simplify(px, py, ids, tol) {
    const n = ids.length, keep = new Uint8Array(n); keep[0] = 1; keep[n - 1] = 1;
    const stack = [[0, n - 1]];
    while (stack.length) {
      const r = stack.pop(), i0 = r[0], i1 = r[1]; if (i1 - i0 < 2) continue;
      const ax = px[ids[i0]], ay = py[ids[i0]], dx = px[ids[i1]] - ax, dy = py[ids[i1]] - ay, L = Math.hypot(dx, dy);
      let best = -1, bd = tol;
      for (let k = i0 + 1; k < i1; k++) {
        const x = px[ids[k]] - ax, y = py[ids[k]] - ay, d = L > 1e-9 ? Math.abs(x * dy - y * dx) / L : Math.hypot(x, y);
        if (d > bd) { bd = d; best = k; }
      }
      if (best >= 0) { keep[best] = 1; stack.push([i0, best], [best, i1]); }
    }
    const out = []; for (let k = 0; k < n; k++) if (keep[k]) out.push(k);
    return out;
  }

  // ② 控制点上各走廊的出口方向：八个方向各不相同，按实际的环绕顺序排列，尽量贴近实际方向；
  // 同一条线从两条走廊穿过时尽量对直（mate：同一条线的另一端，w 为对直的权重）
  function assignPorts(ends) {
    const k = ends.length, TAU = 2 * Math.PI;
    if (k > 8) return ends.map(function (e) { return octNear(e.phi); });
    const order = ends.map(function (_, i) { return i; }).sort(function (a, b) { return ((ends[a].phi % TAU) + TAU) % TAU - ((ends[b].phi % TAU) + TAU) % TAU || a - b; });
    const asg = new Int8Array(k), port = new Int8Array(k), best = new Int8Array(k);
    let bc = Infinity;
    const score = function () {
      for (let j = 0; j < k; j++) port[order[j]] = asg[j];
      let c = 0;
      for (let i = 0; i < k; i++) {
        const d = angDiff(ends[i].phi, port[i] * Q); c += d * d * ends[i].w;
        const m = ends[i].mate; if (m > i) c += PORT_BEND[octDiff(port[i], (port[m] + 4) % 8)] * ends[i].mw;
      }
      if (c < bc - 1e-12) { bc = c; best.set(port); }
    };
    const rec = function (j, prev, o0) {
      if (j === k) { score(); return; }
      for (let r = prev + 1; r <= 8 - (k - j); r++) { asg[j] = (o0 + r) % 8; rec(j + 1, r, o0); }
    };
    for (let o0 = 0; o0 < 8; o0++) { asg[0] = o0; rec(1, 0, o0); }
    return Array.from(best);
  }

  function solve(lay, net, unit) {
    const st = lay.st, N0 = st.length, out = new Map();
    if (!N0) return out;
    const gx0 = new Float64Array(N0), gy0 = new Float64Array(N0);
    for (let i = 0; i < N0; i++) { const s = net.stations[st[i]]; gx0[i] = s.x; gy0[i] = s.y; }
    // 实际交叉点：编号 N0 起，是控制点但不是车站，不输出站位
    const geoLens = lay.edges.map(function (e) { return e.geo; }).sort(function (a, b) { return a - b; });
    const X = crossings(lay.edges, gx0, gy0, Math.max(0.5, geoLens[geoLens.length >> 1] || 1) * 0.12), NX = N0 + X.pts.length;
    const geoX = [], geoY = [];
    for (let i = 0; i < N0; i++) { geoX.push(gx0[i]); geoY.push(gy0[i]); }
    X.pts.forEach(function (p) { geoX.push(p[0]); geoY.push(p[1]); });
    // ① 等比缩放：之后都在版面坐标里排（站距中位数约等于 unit）
    const warp = scaleMap(lay.edges, unit, CM.CFG.W, CM.CFG.H);
    out.warp = warp;
    const qx = [], qy = [];
    for (let i = 0; i < NX; i++) { const q = warp(geoX[i], geoY[i]); qx.push(q[0]); qy.push(q[1]); }
    // 离车站或同一段上另一个交叉点不到约三分之一站距的交叉点不作控制点（几条线几乎在同一处相交时，交叉点挤成一团，
    // 之间的小段放不下最短长度、方向互相矛盾，排版会把它们压扁翻转）：这些线照常各走各的，图上仍在附近相交
    const dropX = new Uint8Array(X.pts.length);
    lay.edges.forEach(function (e, ei) {
      const L = Math.hypot(qx[e.a] - qx[e.b], qy[e.a] - qy[e.b]), cs = X.cuts[ei].slice().sort(function (p, q) { return p.t - q.t; });
      for (let k = 0; k < cs.length; k++) { const t0 = k ? cs[k - 1].t : 0, t1 = k + 1 < cs.length ? cs[k + 1].t : 1; if ((cs[k].t - t0) * L < unit * 0.35 || (t1 - cs[k].t) * L < unit * 0.35) dropX[cs[k].v] = 1; }
    });
    X.cuts = X.cuts.map(function (cs) { return cs.filter(function (c) { return !dropX[c.v]; }); });

    // 站间连线被交叉点切成小段（link）：n0 → n1 与原连线同向，t0、t1 为在原连线上的比例
    const keyOf = function (e) { return e.lines.map(function (l) { return l.lid; }).sort().join(','); };
    const links = [], adj = []; for (let i = 0; i < NX; i++) adj.push([]);
    const eLen = [];   // 原连线在第①步版面上的长度
    lay.edges.forEach(function (e, ei) {
      const k = keyOf(e), cs = X.cuts[ei].slice().sort(function (p, q) { return p.t - q.t; });
      eLen.push(Math.hypot(qx[e.a] - qx[e.b], qy[e.a] - qy[e.b]));
      let prev = e.a, pt = 0;
      const push = function (to, t) { const id = links.length; links.push({ n0: prev, n1: to, t0: pt, t1: t, e: ei, key: k }); adj[prev].push({ to: to, key: k, l: id }); adj[to].push({ to: prev, key: k, l: id }); prev = to; pt = t; };
      for (const c of cs) push(N0 + c.v, c.t);
      push(e.b, 1);
    });
    // 每段站间连线的目标长度：实际长度（车站留在真实位置附近，地形不用跟着变形），太近的站不小于下限
    const LMIN = unit * 0.75;
    const lt = eLen.map(function (L) { return Math.max(L, LMIN); });

    // 控制点：度数不是 2、两侧线路不同、交叉点；没有控制点的纯环线取上下左右四个端点
    const isKey = new Uint8Array(NX);
    for (let i = 0; i < NX; i++) if (adj[i].length !== 2 || adj[i][0].key !== adj[i][1].key || i >= N0) isKey[i] = 1;
    const seen = new Uint8Array(NX);
    for (let i = 0; i < NX; i++) {
      if (seen[i]) continue;
      const comp = [], qu = [i]; seen[i] = 1;
      while (qu.length) { const v = qu.pop(); comp.push(v); for (const e of adj[v]) if (!seen[e.to]) { seen[e.to] = 1; qu.push(e.to); } }
      if (comp.some(function (v) { return isKey[v]; })) continue;
      const ext = [[1, 0], [0, 1], [-1, 0], [0, -1]].map(function (d) { let b = comp[0], bv = -Infinity; for (const v of comp) { const s = qx[v] * d[0] + qy[v] * d[1]; if (s > bv + 1e-9) { bv = s; b = v; } } return b; });
      const picked = new Set(ext); if (picked.size < 3) { const ring = comp.slice().sort(function (a, b) { return a - b; }); for (let k = 0; k < 4; k++) picked.add(ring[Math.floor(k * ring.length / 4)]); }
      picked.forEach(function (v) { isKey[v] = 1; });
    }
    // 走廊：控制点之间的链（seq 含两端，ls 为依次经过的 link）
    const chains = [], usedL = new Uint8Array(links.length);
    for (let i = 0; i < NX; i++) {
      if (!isKey[i]) continue;
      for (const e0 of adj[i]) {
        if (usedL[e0.l]) continue;
        const seq = [i], ls = []; let cur = e0.to, el = e0.l;
        for (;;) {
          usedL[el] = 1; seq.push(cur); ls.push(el);
          if (isKey[cur]) break;
          const nx = adj[cur][0].l === el ? adj[cur][1] : adj[cur][0];
          cur = nx.to; el = nx.l;
        }
        chains.push({ seq: seq, ls: ls, key: links[ls[0]].key });
      }
    }

    // 同两控制点之间有多条走廊（如两条线在一站交汇、出站不远又相交）：两段直线连不上同两点，除站数最少的一条外都至少要折一次；
    // 首尾在同一控制点的走廊也一样
    const mustBend = new Uint8Array(chains.length);
    { const groups = new Map();
      chains.forEach(function (c, ci) { const a = c.seq[0], b = c.seq[c.seq.length - 1]; if (a === b) mustBend[ci] = 1; const k = a < b ? a + '|' + b : b + '|' + a; let l = groups.get(k); if (!l) groups.set(k, l = []); l.push(ci); });
      groups.forEach(function (l) { if (l.length < 2) return; l.sort(function (a, b) { return chains[a].seq.length - chains[b].seq.length || a - b; }); for (let k = 1; k < l.length; k++) mustBend[l[k]] = 1; }); }
    const linkLen = function (li) { const L = links[li], f = Math.abs(L.t1 - L.t0); return { lt: lt[L.e] * f, lmin: Math.max(unit * 0.18, LMIN * f) }; };
    const TOL = unit * 0.3;

    // ② 按参考位置 (rx, ry) 定方向：出口方向 → 走廊方向（动态规划）→ 带方向的小段（subs）、直线段（runs）与段内折点（bends）
    const plan = function (rx, ry) {
      // 出口方向：每条走廊两端各一个；参考方向取沿走廊约 0.9 个站距处
      const refPhi = function (seq) {
        let acc = 0; const lim = unit * 0.9;
        for (let k = 1; k < seq.length; k++) {
          const a = seq[k - 1], b = seq[k], d = Math.hypot(rx[b] - rx[a], ry[b] - ry[a]);
          if (acc + d >= lim || k === seq.length - 1) { const t = d > 1e-9 ? Math.min(1, (lim - acc) / d) : 1, x = rx[a] + (rx[b] - rx[a]) * t, y = ry[a] + (ry[b] - ry[a]) * t; return Math.atan2(y - ry[seq[0]], x - rx[seq[0]]); }
          acc += d;
        }
        return 0;
      };
      const endsAt = new Map();   // 控制点 → [{ c, end: 0 起点 / 1 终点 }]
      chains.forEach(function (c, ci) {
        for (const end of [0, 1]) { const v = end ? c.seq[c.seq.length - 1] : c.seq[0]; let l = endsAt.get(v); if (!l) endsAt.set(v, l = []); l.push({ c: ci, end: end }); }
      });
      const port = chains.map(function () { return [0, 0]; });
      endsAt.forEach(function (list, v) {
        const ends = list.map(function (o) { const c = chains[o.c], seq = o.end ? c.seq.slice().reverse() : c.seq; return { phi: refPhi(seq), w: 1, mate: -1, mw: 0, lines: c.key.split(',') }; });
        // 同一条线恰好有两端在这里：穿过，尽量对直（交叉点上必须对直）
        const byLine = new Map();
        ends.forEach(function (e, i) { for (const l of e.lines) { let a = byLine.get(l); if (!a) byLine.set(l, a = []); a.push(i); } });
        byLine.forEach(function (a) { if (a.length !== 2) return; const i = a[0], j = a[1]; if (ends[i].mate < 0 && ends[j].mate < 0) { ends[i].mate = j; ends[j].mate = i; ends[i].mw = ends[j].mw = v >= N0 ? 4 : 1; } });
        const res = assignPorts(ends);
        list.forEach(function (o, i) { port[o.c][o.end] = res[i]; });
      });

      const nodeX = rx.slice(0, NX), nodeY = ry.slice(0, NX), subs = [], runs = [], bends = [];   // 折点追加到节点表末尾
      for (let ci = 0; ci < chains.length; ci++) {
        const c = chains[ci], seq = c.seq, Pa = port[ci][0], Ab = (port[ci][1] + 4) % 8;
        const shp = simplify(rx, ry, seq, TOL);
        const P = shp.length - 1, opts = [];
        // 每一段的走法：直线（一个方向，偏离实际方向计代价）或段内折一次（相邻两个方向，正好合成实际走向）
        for (let j = 0; j < P; j++) {
          const i0 = shp[j], i1 = shp[j + 1], vx = rx[seq[i1]] - rx[seq[i0]], vy = ry[seq[i1]] - ry[seq[i0]], L = Math.hypot(vx, vy) || 1e-9, phi = Math.atan2(vy, vx), lu = Math.max(0.5, L / unit), o = [];
          for (let d = 0; d < 8; d++) { const dev = angDiff(phi, d * Q); if (dev <= 1.2) o.push({ e: d, x: d, c: K_FIT * lu * dev * dev, f: -1 }); }
          for (let d1 = 0; d1 < 8; d1++) for (const s of [1, -1, 2, -2]) {
            const d2 = (d1 + s + 8) % 8, u1 = DIRS[d1], u2 = DIRS[d2], det = u1[0] * u2[1] - u1[1] * u2[0];
            const a = (vx * u2[1] - vy * u2[0]) / det, b = (u1[0] * vy - u1[1] * vx) / det;   // 实际走向 = a·方向1 + b·方向2
            if (a < L * 0.12 || b < L * 0.12) continue;
            o.push({ e: d1, x: d2, c: Math.abs(s) === 1 ? B_IN45 : B_IN90, f: a / (a + b) });
          }
          opts.push(o);
        }
        // 出口方向与这一段的方向不同：在控制点旁先沿出口方向走一小段再转（如两条线在同两站之间各走各的，画成并行的梯形而不是尖角）。
        // 段内只折一次、又只有一段站间连线时放不下这一小段，只能硬改出口方向（代价高）
        const single = function (j) { return shp[j + 1] - shp[j] === 1; };
        const endCost = function (j, d, P0, op) { if (d === P0) return 0; return op.f >= 0 && single(j) ? PORT_MISS + BEND[octDiff(d, P0)] : STUB + BEND[octDiff(d, P0)]; };
        // 动态规划：状态为「当前方向 × 是否已经折过」
        let cost = null; const back = [];
        for (let j = 0; j < P; j++) {
          const nc = new Float64Array(16).fill(Infinity), nb = new Array(16);
          for (const op of opts[j]) {
            const inB = op.f >= 0 ? 1 : 0;
            const take = function (base, prevS, bent) {
              let tot = base + op.c, nbent = bent | inB;
              if (j === P - 1) { tot += endCost(j, op.x, Ab, op); if (op.x !== Ab) nbent = 1; }
              const ns = op.x * 2 + nbent;
              if (tot < nc[ns]) { nc[ns] = tot; nb[ns] = { op: op, prev: prevS }; }
            };
            if (j === 0) take(endCost(0, op.e, Pa, op), -1, op.e !== Pa ? 1 : 0);
            else for (let s = 0; s < 16; s++) { if (cost[s] === Infinity) continue; const x = s >> 1; take(cost[s] + BEND[octDiff(x, op.e)], s, (s & 1) | (x !== op.e ? 1 : 0)); }
          }
          back.push(nb); cost = nc;
        }
        let bs = -1; for (let s = 0; s < 16; s++) if ((!mustBend[ci] || (s & 1)) && cost[s] < Infinity && (bs < 0 || cost[s] < cost[bs])) bs = s;
        if (bs < 0) for (let s = 0; s < 16; s++) if (cost[s] < Infinity && (bs < 0 || cost[s] < cost[bs])) bs = s;
        const choice = new Array(P);
        for (let j = P - 1; j >= 0; j--) { const b = back[j][bs]; choice[j] = b.op; bs = b.prev; }
        // 两端需要的小段（stub）：生成小段时在第一 / 最后一段站间连线里加折点
        const stubA = choice[0].e !== Pa && !(choice[0].f >= 0 && single(0)) ? Pa : -1;
        const stubB = choice[P - 1].x !== Ab && !(choice[P - 1].f >= 0 && single(P - 1)) ? Ab : -1;
        let run = null;
        const addSub = function (a, b, d, lmin, ltv) {
          if (!run || run.d !== d || run.nodes[run.nodes.length - 1] !== a) { run = { d: d, subs: [], nodes: [a] }; runs.push(run); }
          const s = { a: a, b: b, d: d, lmin: lmin, lt: ltv }; subs.push(s); run.subs.push(s); run.nodes.push(b);
        };
        // 每段站间连线的走法：[{ d 方向, f 占这段的比例 }]，多于一份时中间加折点
        const m = seq.length - 1, pl = new Array(m);
        for (let j = 0; j < P; j++) {
          const i0 = shp[j], i1 = shp[j + 1], op = choice[j];
          if (op.f < 0) { for (let k = i0; k < i1; k++) pl[k] = [{ d: op.e, f: 1 }]; continue; }
          if (i1 - i0 >= 2) {
            // 在最接近折点比例的车站处转弯
            const acc = [0]; for (let k = i0 + 1; k <= i1; k++) acc.push(acc[acc.length - 1] + Math.hypot(rx[seq[k]] - rx[seq[k - 1]], ry[seq[k]] - ry[seq[k - 1]]));
            const S = acc[acc.length - 1] || 1; let kb = i0 + 1, bd = Infinity;
            for (let k = i0 + 1; k < i1; k++) { const d = Math.abs(acc[k - i0] / S - op.f); if (d < bd) { bd = d; kb = k; } }
            for (let k = i0; k < i1; k++) pl[k] = [{ d: k < kb ? op.e : op.x, f: 1 }];
            continue;
          }
          pl[i0] = [{ d: op.e, f: op.f }, { d: op.x, f: 1 - op.f }];   // 一段站间连线内折一次
        }
        const stubF = function (k) { return Math.min(0.4, unit * 0.3 / Math.max(linkLen(c.ls[k]).lt, 1e-9)); };
        if (stubA >= 0) { const fs = stubF(0); pl[0] = [{ d: stubA, f: fs, stub: 1 }].concat(pl[0].map(function (p) { return { d: p.d, f: p.f * (1 - fs) }; })); }
        if (stubB >= 0) { const fs = stubF(m - 1); pl[m - 1] = pl[m - 1].map(function (p) { return { d: p.d, f: p.f * (1 - fs), stub: p.stub }; }).concat([{ d: stubB, f: fs, stub: 1 }]); }
        for (let k = 0; k < m; k++) {
          const li = c.ls[k], L = links[li], fwd = L.n0 === seq[k], ll = linkLen(li), parts = pl[k], ta = fwd ? L.t0 : L.t1, tb = fwd ? L.t1 : L.t0;
          let prevNode = seq[k], acc = 0;
          for (let p = 0; p < parts.length; p++) {
            const part = parts[p]; let nxt = seq[k + 1];
            if (p < parts.length - 1) {
              acc += part.f; nxt = nodeX.length;
              nodeX.push(rx[seq[k]] + (rx[seq[k + 1]] - rx[seq[k]]) * acc); nodeY.push(ry[seq[k]] + (ry[seq[k + 1]] - ry[seq[k]]) * acc);
              bends.push({ v: nxt, e: L.e, t: ta + (tb - ta) * acc });
            }
            if (part.stub) addSub(prevNode, nxt, part.d, unit * 0.22, unit * 0.3);
            else addSub(prevNode, nxt, part.d, Math.max(unit * 0.12, ll.lmin * part.f), ll.lt * part.f);
            prevNode = nxt;
          }
        }
      }
      return { subs: subs, runs: runs, bends: bends, px: Float64Array.from(nodeX), py: Float64Array.from(nodeY) };
    };

    // ③ 定位置：方向固定后反复投影（站距不小于下限，向目标站距靠拢），车站与交叉点轻拉回第①步的位置，挨得太近的互相推开
    const relax = function (L, rounds) {
      const subs = L.subs, px = L.px, py = L.py, NN = px.length;
      const project = function (w, kLen) {
        for (let pass = 0; pass < 2; pass++) {
          for (let s0 = 0; s0 < subs.length; s0++) {
            const e = subs[pass ? subs.length - 1 - s0 : s0], u = DIRS[e.d], vx = px[e.b] - px[e.a], vy = py[e.b] - py[e.a];
            let l = vx * u[0] + vy * u[1];
            if (l < e.lmin) l = e.lmin; else { l += (e.lt - l) * kLen; if (l > e.lt * 2.2) l -= (l - e.lt * 2.2) * 0.5; }
            const cx = (u[0] * l - vx) * 0.5 * w, cy = (u[1] * l - vy) * 0.5 * w;
            px[e.a] -= cx; py[e.a] -= cy; px[e.b] += cx; py[e.b] += cy;
          }
        }
      };
      const anchor = function (k) { for (let i = 0; i < NX; i++) { px[i] += (qx[i] - px[i]) * k; py[i] += (qy[i] - py[i]) * k; } };
      // 挨得太近的走廊、车站互相推开（共用控制点附近本来就挨着，不推）
      const CLEAR = unit * 0.55, cell = unit * 1.2;
      const separate = function (w) {
        const OFF = 5000, KW = 20000, grid = new Map(), put = function (x, y, v) { const key = (Math.floor(x / cell) + OFF) * KW + Math.floor(y / cell) + OFF; let l = grid.get(key); if (!l) grid.set(key, l = []); l.push(v); };
        const len = subs.map(function (e) { return Math.hypot(px[e.b] - px[e.a], py[e.b] - py[e.a]); });
        subs.forEach(function (e, i) { const n = Math.max(1, Math.round(len[i] / (unit * 0.4))); for (let k = 0; k <= n; k++) put(px[e.a] + (px[e.b] - px[e.a]) * k / n, py[e.a] + (py[e.b] - py[e.a]) * k / n, { e: i, t: k / n }); });
        const mv = new Float64Array(NN * 2), cnt = new Float64Array(NN);
        const fromNode = function (e, i, t, v) { return (v === e.a ? t : 1 - t) * len[i]; };
        const add = function (v, x, y) { mv[2 * v] += x; mv[2 * v + 1] += y; cnt[v]++; };
        grid.forEach(function (list, key) {
          const cxx = Math.floor(key / KW), cyy = key - cxx * KW;
          for (const sp of list) {
            const ea = subs[sp.e], sx = px[ea.a] + (px[ea.b] - px[ea.a]) * sp.t, sy = py[ea.a] + (py[ea.b] - py[ea.a]) * sp.t;
            for (let gx0 = cxx - 1; gx0 <= cxx + 1; gx0++) for (let gy0 = cyy - 1; gy0 <= cyy + 1; gy0++) {
              for (const other of grid.get(gx0 * KW + gy0) || []) {
                if (other.e <= sp.e) continue;
                const eb = subs[other.e];
                let near = false;
                for (const v of [ea.a, ea.b]) if ((v === eb.a || v === eb.b) && (fromNode(ea, sp.e, sp.t, v) < unit * 0.9 || fromNode(eb, other.e, other.t, v) < unit * 0.9)) near = true;
                if (near) continue;
                const qx2 = px[eb.a] + (px[eb.b] - px[eb.a]) * other.t, qy2 = py[eb.a] + (py[eb.b] - py[eb.a]) * other.t;
                let dx = sx - qx2, dy = sy - qy2, dd = Math.hypot(dx, dy);
                if (dd >= CLEAR) continue;
                if (dd < 1e-3) { dx = 1; dy = 0.3; dd = 1.04; }
                const f = (CLEAR - dd) / dd * 0.5 * w; dx *= f; dy *= f;
                add(ea.a, dx * (1 - sp.t), dy * (1 - sp.t)); add(ea.b, dx * sp.t, dy * sp.t);
                add(eb.a, -dx * (1 - other.t), -dy * (1 - other.t)); add(eb.b, -dx * other.t, -dy * other.t);
              }
            }
          }
        });
        for (let v = 0; v < NN; v++) if (cnt[v]) { px[v] += mv[2 * v] / cnt[v]; py[v] += mv[2 * v + 1] / cnt[v]; }
      };
      for (let it = 0; it < rounds; it++) { project(0.9, 0.04); anchor(0.01); if (it % 5 === 4) separate(0.6); }
      for (let it = 0; it < 120; it++) { project(0.9, 0.04); if (it % 6 === 5) separate(0.5); }
      for (let it = 0; it < 200; it++) project(1, 0.02);
    };
    // 直线段的残差：两端连线偏离给定方向的距离、沿方向的长度
    const runFit = function (L, r) { const a = r.nodes[0], b = r.nodes[r.nodes.length - 1], d = DIRS[r.d], vx = L.px[b] - L.px[a], vy = L.py[b] - L.py[a]; return { perp: Math.abs(vx * d[1] - vy * d[0]), along: vx * d[0] + vy * d[1] }; };
    const misfit = function (L, r) { const f = runFit(L, r), lmin = r.subs.reduce(function (t, e) { return t + e.lmin; }, 0); return f.perp > unit * 0.2 || f.along < lmin * 0.7; };

    let lay2 = plan(qx, qy);
    relax(lay2, 300);
    // 有直线段对不上（方向互相矛盾，常见于很小的三角形）：按排出来的位置重新定一次方向，再排一次
    const nMis = lay2.runs.filter(function (r) { return misfit(lay2, r); }).length;
    if (nMis) {
      const rx = Array.from(lay2.px.subarray(0, NX)), ry = Array.from(lay2.py.subarray(0, NX)), L2 = plan(rx, ry);
      relax(L2, 160);
      if (L2.runs.filter(function (r) { return misfit(L2, r); }).length < nMis) lay2 = L2;
    }
    const subs = lay2.subs, runs = lay2.runs, bends = lay2.bends, px = lay2.px, py = lay2.py, NN = px.length;
    // 收尾：直线段严格对齐。方向固定时「每段只沿自己的方向」是线性约束，求离当前位置最近的满足全部约束的位置
    // （p ← p − Nᵀλ，(N Nᵀ)λ = N p，共轭梯度）；有环时迭代投影收敛不完，这里一次到位，不留几像素的斜边。
    // 实在对不上的直线段不参加（硬对齐会把它翻过来），由画线时走两折
    { const skip = new Set(runs.filter(function (r) { return misfit(lay2, r); })), px0 = Float64Array.from(px), py0 = Float64Array.from(py), tx = new Float64Array(NN), ty = new Float64Array(NN);
      const lminOf = function (r) { return r.subs.reduce(function (t, e) { return t + e.lmin; }, 0); };
      // 对齐后有直线段被压得太短（不到下限的一半）：它不参加对齐，从对齐前的位置重来，最多三次
      for (let round = 0; round < 4; round++) {
        const use = runs.filter(function (r) { return !skip.has(r); }), S = use.length, nrm = use.map(function (r) { const d = DIRS[r.d]; return [-d[1], d[0]]; });
        const ra = use.map(function (r) { return r.nodes[0]; }), rb = use.map(function (r) { return r.nodes[r.nodes.length - 1]; });
        const Np = function (x, y, o) { for (let s = 0; s < S; s++) o[s] = nrm[s][0] * (x[rb[s]] - x[ra[s]]) + nrm[s][1] * (y[rb[s]] - y[ra[s]]); };
        const NtL = function (l) { tx.fill(0); ty.fill(0); for (let s = 0; s < S; s++) { tx[ra[s]] -= l[s] * nrm[s][0]; ty[ra[s]] -= l[s] * nrm[s][1]; tx[rb[s]] += l[s] * nrm[s][0]; ty[rb[s]] += l[s] * nrm[s][1]; } };
        const b = new Float64Array(S), lam = new Float64Array(S), r = new Float64Array(S), p = new Float64Array(S), Ap = new Float64Array(S);
        px.set(px0); py.set(py0);
        Np(px, py, b); r.set(b); p.set(b);
        let rr = 0; for (let s = 0; s < S; s++) rr += r[s] * r[s];
        for (let it = 0; it < 400 && rr > 1e-8 * S; it++) {
          NtL(p); Np(tx, ty, Ap);
          let pAp = 0; for (let s = 0; s < S; s++) pAp += p[s] * Ap[s];
          if (!(pAp > 1e-30)) break;
          const al = rr / pAp; let rn = 0;
          for (let s = 0; s < S; s++) { lam[s] += al * p[s]; r[s] -= al * Ap[s]; rn += r[s] * r[s]; }
          const be = rn / rr; rr = rn; for (let s = 0; s < S; s++) p[s] = r[s] + be * p[s];
        }
        NtL(lam); for (let v = 0; v < NN; v++) { px[v] -= tx[v]; py[v] -= ty[v]; }
        const crushed = use.filter(function (r0) { return runFit(lay2, r0).along < lminOf(r0) * 0.5; });
        if (!crushed.length || round === 3) break;
        crushed.forEach(function (r0) { skip.add(r0); });
      }
      // 段内车站按目标站距排开
      for (const r0 of runs) {
        if (r0.subs.length < 2) continue;
        const a = r0.nodes[0], c = r0.nodes[r0.nodes.length - 1], tot = r0.subs.reduce(function (s, e) { return s + e.lt; }, 0) || 1;
        let acc = 0;
        for (let k = 0; k < r0.subs.length - 1; k++) { acc += r0.subs[k].lt; const v = r0.nodes[k + 1], t = acc / tot; px[v] = px[a] + (px[c] - px[a]) * t; py[v] = py[a] + (py[c] - py[a]) * t; }
      }
    }
    for (let i = 0; i < N0; i++) out.set(st[i], [px[i], py[i]]);
    // 站间连线依次经过的交叉点和折点：画线时站间路线要经过它们（netmap.js diagramRoute），江海底图也把它们当控制点
    const inner = lay.edges.map(function () { return []; });
    lay.edges.forEach(function (e, ei) { for (const c of X.cuts[ei]) inner[ei].push({ t: c.t, v: N0 + c.v }); });
    for (const b of bends) inner[b.e].push({ t: b.t, v: b.v });
    out.via = new Map(); out.virt = [];
    lay.edges.forEach(function (e, ei) {
      if (!inner[ei].length) return;
      inner[ei].sort(function (p, q) { return p.t - q.t; });
      out.via.set(st[e.a] + '|' + st[e.b], inner[ei].map(function (o) { return [px[o.v], py[o.v]]; }));
    });
    for (let i = N0; i < NX; i++) if (!dropX[i - N0]) out.virt.push({ g: [geoX[i], geoY[i]], p: [px[i], py[i]] });
    for (const b of bends) { const e = lay.edges[b.e]; out.virt.push({ g: [gx0[e.a] + (gx0[e.b] - gx0[e.a]) * b.t, gy0[e.a] + (gy0[e.b] - gy0[e.a]) * b.t], p: [px[b.v], py[b.v]] }); }
    return out;
  }
  CM.NetLayout = { solve: solve };
})(window.CM);
