'use strict';
// 线路示意图的排版（v2.7）：按常见地铁图的做法，线路只走水平、竖直和 45° 斜线，站距基本均匀，大致保留地理方位。
// 做法：把换乘站、支线点、线路真正转弯的地方和两条线实际相交的点（隐形，不是车站）作为控制点，中间的普通站沿走廊均匀排开；
// 控制点之间的走廊选定八个方向之一后反复投影（位置约束迭代），长度不小于「站数 × 站距」；走廊之间或车站与走廊挨得太近时互相推开。
// 结果只取决于线网，不用随机数，同一线网每次排出来都一样。
(function (CM) {
  const DIRS = []; for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4; DIRS.push([Math.round(Math.cos(a) * 1e9) / 1e9, Math.round(Math.sin(a) * 1e9) / 1e9]); }
  const angOf = function (dx, dy) { return Math.atan2(dy, dx); };
  const angDiff = function (a, b) { let d = Math.abs(a - b) % (2 * Math.PI); return d > Math.PI ? 2 * Math.PI - d : d; };

  // 把相邻站之间的边收缩成控制点之间的走廊
  function buildChains(N, adj, isKey) {
    const chains = [], used = new Set();
    const edgeKey = function (a, b) { return a < b ? a + '|' + b : b + '|' + a; };
    for (let i = 0; i < N; i++) {
      if (!isKey[i]) continue;
      for (const e0 of adj[i]) {
        if (used.has(edgeKey(i, e0.to))) continue;
        const nodes = [], start = i; let prev = i, cur = e0.to;
        used.add(edgeKey(prev, cur));
        while (!isKey[cur]) {
          nodes.push(cur);
          const nx = adj[cur][0].to === prev ? adj[cur][1].to : adj[cur][0].to;
          used.add(edgeKey(cur, nx)); prev = cur; cur = nx;
        }
        chains.push({ a: start, b: cur, nodes: nodes, ls: e0.key });
      }
    }
    return chains;
  }
  // 走廊上偏离首尾连线最远的车站（用来判断要不要在这里转弯）
  function farthest(ch, gx, gy) {
    const ax = gx[ch.a], ay = gy[ch.a], bx = gx[ch.b], by = gy[ch.b], dx = bx - ax, dy = by - ay, L = Math.hypot(dx, dy);
    let best = -1, bd = -1;
    for (let k = 0; k < ch.nodes.length; k++) {
      const n = ch.nodes[k], d = L > 1e-6 ? Math.abs((gx[n] - ax) * dy - (gy[n] - ay) * dx) / L : Math.hypot(gx[n] - ax, gy[n] - ay);
      if (d > bd) { bd = d; best = n; }
    }
    return { node: best, dist: bd, len: L };
  }

  // 两条线实际相交的点（v2.7 玩家反馈：以很小角度相交的两条线会被吸附成平行，交叉点丢失，交叉点两侧的站左右排反）：
  // 不共用车站、实际相交的两段站间连线，交点作为两条线共用的隐形控制点，两段都从交点断开，排版时两条线必须在这一点相交。
  // 返回交点坐标与每段被切开的位置（按段内比例）
  function crossings(edges, gx, gy) {
    const pts = [], cuts = edges.map(function () { return []; }), box = edges.map(function (e) { return [Math.min(gx[e.a], gx[e.b]), Math.min(gy[e.a], gy[e.b]), Math.max(gx[e.a], gx[e.b]), Math.max(gy[e.a], gy[e.b])]; });
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
      const v = pts.length; pts.push([ax + (bx - ax) * t, ay + (by - ay) * t]);
      cuts[i].push({ t: t, v: v }); cuts[j].push({ t: u, v: v });
    }
    return { pts: pts, cuts: cuts };
  }

  function solve(lay, net, unit) {
    const st = lay.st, N0 = st.length, out = new Map();
    if (!N0) return out;
    const gx0 = new Float64Array(N0), gy0 = new Float64Array(N0);
    for (let i = 0; i < N0; i++) { const s = net.stations[st[i]]; gx0[i] = s.x; gy0[i] = s.y; }
    // 实际交叉点：编号 N0 起，是控制点但不是车站，不输出站位
    const X = crossings(lay.edges, gx0, gy0), N = N0 + X.pts.length;
    const gx = new Float64Array(N), gy = new Float64Array(N);
    gx.set(gx0); gy.set(gy0); X.pts.forEach(function (p, k) { gx[N0 + k] = p[0]; gy[N0 + k] = p[1]; });
    const adj = []; for (let i = 0; i < N; i++) adj.push([]);
    const keyOf = function (e) { return e.lines.map(function (l) { return l.lid; }).sort().join(','); };
    const lens = [], via = [];   // via：被切开的段 → 依次经过的交点
    lay.edges.forEach(function (e, ei) {
      const k = keyOf(e), cs = X.cuts[ei].slice().sort(function (p, q) { return p.t - q.t; });
      let prev = e.a;
      for (const c of cs) { const v = N0 + c.v; adj[prev].push({ to: v, key: k }); adj[v].push({ to: prev, key: k }); prev = v; }
      adj[prev].push({ to: e.b, key: k }); adj[e.b].push({ to: prev, key: k });
      if (cs.length) via.push({ a: e.a, b: e.b, v: cs.map(function (c) { return N0 + c.v; }) });
      lens.push(e.geo);
    });
    const isKey = new Uint8Array(N);
    for (let i = 0; i < N; i++) if (adj[i].length !== 2 || adj[i][0].key !== adj[i][1].key) isKey[i] = 1;
    // 纯环线没有控制点：取环上的四个点
    const seen = new Uint8Array(N);
    for (let i = 0; i < N; i++) {
      if (seen[i]) continue;
      const comp = [], q = [i]; seen[i] = 1;
      while (q.length) { const v = q.pop(); comp.push(v); for (const e of adj[v]) if (!seen[e.to]) { seen[e.to] = 1; q.push(e.to); } }
      if (!comp.some(function (v) { return isKey[v]; })) { const ring = []; let prev = -1, cur = comp[0]; do { ring.push(cur); const nx = adj[cur][0].to === prev ? adj[cur][1].to : adj[cur][0].to; prev = cur; cur = nx; } while (cur !== comp[0] && ring.length <= comp.length); for (let k = 0; k < 4; k++) isKey[ring[Math.floor(k * ring.length / 4)]] = 1; }
    }
    // 站距中位数：转弯判断和初始缩放都以它为尺度（城区站密、郊区站疏，用固定格数会把市中心的拐角抹掉）
    lens.sort(function (a, b) { return a - b; });
    const med = Math.max(0.5, lens[lens.length >> 1] || 1);
    // 线路在某站真正转弯（前后两段夹角超过约 50°，且这站离前后两站的连线足够远）：这站作为控制点，图上在这里转弯
    for (let i = 0; i < N; i++) {
      if (isKey[i]) continue;
      const p = adj[i][0].to, q = adj[i][1].to, ax = gx[i] - gx[p], ay = gy[i] - gy[p], bx = gx[q] - gx[i], by = gy[q] - gy[i];
      const cx = gx[q] - gx[p], cy = gy[q] - gy[p], cl = Math.hypot(cx, cy), h = cl > 1e-6 ? Math.abs(ax * cy - ay * cx) / cl : Math.hypot(ax, ay);
      if (angDiff(angOf(ax, ay), angOf(bx, by)) > 0.9 && h > med * 0.3) isKey[i] = 1;
    }
    // 走廊明显弯折或首尾重合（环）的地方加控制点，保留线路的大致走向
    let chains = buildChains(N, adj, isKey);
    for (let pass = 0; pass < 8; pass++) {
      let added = false;
      for (const ch of chains) {
        if (!ch.nodes.length) continue;
        const f = farthest(ch, gx, gy), tol = Math.max(med * 0.75, f.len * 0.16);
        if (ch.a === ch.b || f.dist > tol) { isKey[f.node] = 1; added = true; }
      }
      if (!added) break;
      chains = buildChains(N, adj, isKey);
    }
    // 两个控制点之间有多条走廊时，较长的那条中间加一个控制点，避免它们重合
    { const pairs = new Map(); for (const ch of chains) { const k = ch.a < ch.b ? ch.a + '|' + ch.b : ch.b + '|' + ch.a; if (!pairs.has(k)) pairs.set(k, []); pairs.get(k).push(ch); }
      let added = false; pairs.forEach(function (list) { if (list.length < 2) return; list.sort(function (p, q) { return q.nodes.length - p.nodes.length; }); for (let k = 0; k < list.length - 1; k++) if (list[k].nodes.length) { isKey[list[k].nodes[list[k].nodes.length >> 1]] = 1; added = true; } });
      if (added) chains = buildChains(N, adj, isKey); }

    // 控制点初始位置：地理位置等比放大，站距中位数约等于目标站距
    const s0 = unit / med;
    const px = new Float64Array(N), py = new Float64Array(N), p0x = new Float64Array(N), p0y = new Float64Array(N);
    for (let i = 0; i < N; i++) { px[i] = p0x[i] = gx[i] * s0; py[i] = p0y[i] = gy[i] * s0; }
    const keys = []; for (let i = 0; i < N; i++) if (isKey[i]) keys.push(i);
    // 走廊长度按站距计：两头若是交叉点（不是车站）各只算半个站距，一段站间连线被交叉点切开后合起来仍约一个站距，不会被拉长
    const E = chains.map(function (ch) {
      const n = ch.nodes.length, eff = Math.max(0.35, n + 1 - 0.5 * ((ch.a >= N0 ? 1 : 0) + (ch.b >= N0 ? 1 : 0)));
      return { a: ch.a, b: ch.b, nodes: ch.nodes, lmin: eff * unit, lmax: eff * unit * 1.7 + unit * 0.6, d: 0, ang0: angOf(gx[ch.b] - gx[ch.a], gy[ch.b] - gy[ch.a]) };
    });
    const inc = new Map(); for (const k of keys) inc.set(k, []);
    E.forEach(function (e, i) { inc.get(e.a).push(i); inc.get(e.b).push(i); });
    // 每条走廊选一个方向：尽量接近实际方向，同一控制点上不能有两条走廊同向
    // 可选方向离实际方向最多偏一档（约 68°）：重排时也不许把走廊翻到另一侧，否则站的东西、南北顺序会颠倒
    const Q = Math.PI / 4, ref = new Float64Array(E.length);
    const dirOut = function (e, at) { return at === e.a ? e.d : (e.d + 4) % 8; };
    const allowed = function (e, k) { return angDiff(e.ang0, k * Q) <= 1.2; };
    const cost = function (i) {
      const e = E[i], dev = angDiff(ref[i], e.d * Q); let c = dev * dev;
      for (const j of inc.get(e.a)) { const o = E[j]; if (o !== e && dirOut(o, e.a) === e.d) c += 50; }
      for (const j of inc.get(e.b)) { const o = E[j]; if (o !== e && dirOut(o, e.b) === (e.d + 4) % 8) c += 50; }
      return c;
    };
    const assign = function (useGeo) {
      E.forEach(function (e, i) {
        ref[i] = useGeo ? e.ang0 : angOf(px[e.b] - px[e.a], py[e.b] - py[e.a]);
        let best = 0, bd = Infinity; for (let k = 0; k < 8; k++) { const d = angDiff(ref[i], k * Q); if (allowed(e, k) && d < bd) { bd = d; best = k; } } e.d = best;
      });
      for (let pass = 0; pass < 6; pass++) {
        let changed = false;
        // 逐条换方向
        E.forEach(function (e, i) {
          const d0 = e.d; let best = d0, bc = cost(i);
          for (let k = 0; k < 8; k++) { if (k === d0 || !allowed(e, k)) continue; e.d = k; const c = cost(i); if (c < bc - 1e-9) { bc = c; best = k; } }
          e.d = best; if (best !== d0) changed = true;
        });
        // 同一控制点上的两条走廊一起换：三角形这类必须同时改两条才能各走各的方向（如环线拐角旁再有一条支线）
        for (const v of keys) {
          const L = inc.get(v);
          for (let x = 0; x < L.length; x++) for (let y = x + 1; y < L.length; y++) {
            const i = L[x], j = L[y]; if (i === j) continue;
            const e = E[i], o = E[j], d1 = e.d, d2 = o.d; let bc = cost(i) + cost(j), b1 = d1, b2 = d2;
            for (let k1 = 0; k1 < 8; k1++) { if (!allowed(e, k1)) continue; e.d = k1; for (let k2 = 0; k2 < 8; k2++) { if (!allowed(o, k2)) continue; o.d = k2; const c = cost(i) + cost(j); if (c < bc - 1e-9) { bc = c; b1 = k1; b2 = k2; } } }
            e.d = b1; o.d = b2; if (b1 !== d1 || b2 !== d2) changed = true;
          }
        }
        if (!changed) break;
      }
    };
    const project = function (w, anchor) {
      for (const e of E) {
        const d = DIRS[e.d], vx = px[e.b] - px[e.a], vy = py[e.b] - py[e.a];
        // 长度下限是硬的（站不能挤在一起），上限只是让站距均匀，减半纠正：线网有矛盾时宁可拉长一段，也不把另一段压扁
        let l = vx * d[0] + vy * d[1]; if (l < e.lmin) l = e.lmin; else if (l > e.lmax) l -= (l - e.lmax) * 0.5;
        const cx = (d[0] * l - vx) * 0.5 * w, cy = (d[1] * l - vy) * 0.5 * w;
        px[e.a] -= cx; py[e.a] -= cy; px[e.b] += cx; py[e.b] += cy;
      }
      if (anchor) for (const k of keys) { px[k] += (p0x[k] - px[k]) * anchor; py[k] += (p0y[k] - py[k]) * anchor; }
    };
    // 把走廊沿线取样放进网格，让挨得太近的走廊、车站互相推开
    const CLEAR = unit * 0.62, cell = unit * 1.4;
    const separate = function (w) {
      const OFF = 5000, KW = 20000, grid = new Map(), put = function (x, y, v) { const key = (Math.floor(x / cell) + OFF) * KW + Math.floor(y / cell) + OFF; let l = grid.get(key); if (!l) grid.set(key, l = []); l.push(v); };
      E.forEach(function (e, i) { const vx = px[e.b] - px[e.a], vy = py[e.b] - py[e.a], L = Math.hypot(vx, vy) || 1, n = Math.max(1, Math.round(L / (unit * 0.8))); for (let k = 0; k <= n; k++) put(px[e.a] + vx * k / n, py[e.a] + vy * k / n, { e: i, t: k / n }); });
      const moves = new Map(), mv = function (id, dx, dy) { let m = moves.get(id); if (!m) moves.set(id, m = [0, 0, 0]); m[0] += dx; m[1] += dy; m[2]++; };
      const len = E.map(function (e) { return Math.hypot(px[e.b] - px[e.a], py[e.b] - py[e.a]); });
      // 取样点到共用控制点的距离：共用控制点附近本来就挨着，不推；走远了还贴在一起（走廊绕回来）才推开
      const fromNode = function (e, i, t, v) { return (v === e.a ? t : 1 - t) * len[i]; };
      grid.forEach(function (list, key) {
        const cxx = Math.floor(key / KW), cyy = key - cxx * KW;
        for (const sp of list) {
          const ea = E[sp.e], sx = px[ea.a] + (px[ea.b] - px[ea.a]) * sp.t, sy = py[ea.a] + (py[ea.b] - py[ea.a]) * sp.t;
          for (let gx0 = cxx - 1; gx0 <= cxx + 1; gx0++) for (let gy0 = cyy - 1; gy0 <= cyy + 1; gy0++) {
            for (const other of grid.get(gx0 * KW + gy0) || []) {
              if (other.e <= sp.e) continue;
              const eb = E[other.e];
              let near = false;
              for (const v of [ea.a, ea.b]) if ((v === eb.a || v === eb.b) && (fromNode(ea, sp.e, sp.t, v) < unit * 1.1 || fromNode(eb, other.e, other.t, v) < unit * 1.1)) near = true;
              if (near) continue;
              const qx = px[eb.a] + (px[eb.b] - px[eb.a]) * other.t, qy = py[eb.a] + (py[eb.b] - py[eb.a]) * other.t;
              let dx = sx - qx, dy = sy - qy, dd = Math.hypot(dx, dy);
              if (dd >= CLEAR) continue;
              if (dd < 1e-3) { dx = 1; dy = 0.3; dd = 1.04; }
              const f = (CLEAR - dd) / dd * 0.5 * w; dx *= f; dy *= f;
              mv(ea.a, dx * (1 - sp.t), dy * (1 - sp.t)); mv(ea.b, dx * sp.t, dy * sp.t);
              mv(eb.a, -dx * (1 - other.t), -dy * (1 - other.t)); mv(eb.b, -dx * other.t, -dy * other.t);
            }
          }
        }
      });
      moves.forEach(function (m, id) { px[id] += m[0] / m[2]; py[id] += m[1] / m[2]; });
    };
    assign(true);
    for (let it = 0; it < 160; it++) {
      project(0.9, it < 110 ? 0.0025 : 0);
      if (it % 4 === 3) separate(0.7);
      if (it % 24 === 23 && it < 120) assign(false);
    }
    for (let it = 0; it < 90; it++) { project(0.85, 0); if (it % 6 === 5) separate(0.5); }
    for (let it = 0; it < 240; it++) project(1, 0);
    // 收尾：从度数最高的控制点沿走廊走一遍，把基本对齐的走廊修成严格的八方向，不留几像素的折角
    { const done = new Uint8Array(N), order = keys.slice().sort(function (a, b) { return inc.get(b).length - inc.get(a).length || a - b; });
      for (const root of order) {
        if (done[root]) continue;
        done[root] = 1; const q = [root];
        for (let h = 0; h < q.length; h++) {
          const v = q[h];
          for (const j of inc.get(v)) {
            const e = E[j], o = e.a === v ? e.b : e.a; if (done[o]) continue;
            const sign = e.a === v ? 1 : -1, d = DIRS[e.d], vx = (px[o] - px[v]) * sign, vy = (py[o] - py[v]) * sign, l = vx * d[0] + vy * d[1];
            if (Math.abs(vx * d[1] - vy * d[0]) < 6 && l > 0) { px[o] = px[v] + sign * d[0] * l; py[o] = py[v] + sign * d[1] * l; }
            done[o] = 1; q.push(o);
          }
        }
      }
    }
    // 中间车站沿走廊均匀排开；走廊没能对齐时走两段（先沿主方向，再转到相邻方向）
    for (const e of E) {
      const n = e.nodes.length; if (!n) continue;
      const ax = px[e.a], ay = py[e.a], bx = px[e.b], by = py[e.b], d = DIRS[e.d], vx = bx - ax, vy = by - ay, off = Math.abs(vx * d[1] - vy * d[0]);
      if (off < 6) { for (let k = 0; k < n; k++) { const t = (k + 1) / (n + 1), id = e.nodes[k]; px[id] = ax + vx * t; py[id] = ay + vy * t; } continue; }
      // 拆成主方向 + 相邻方向两段
      const sideK = vx * d[1] - vy * d[0] > 0 ? (e.d + 7) % 8 : (e.d + 1) % 8, s = DIRS[sideK], det = d[0] * s[1] - d[1] * s[0], l1 = (vx * s[1] - vy * s[0]) / det, l2 = (d[0] * vy - d[1] * vx) / det;
      const total = Math.abs(l1) + Math.abs(l2);
      for (let k = 0; k < n; k++) {
        const u = total * (k + 1) / (n + 1), id = e.nodes[k];
        if (u <= Math.abs(l1)) { px[id] = ax + d[0] * u * Math.sign(l1); py[id] = ay + d[1] * u * Math.sign(l1); }
        else { const rest = u - Math.abs(l1); px[id] = ax + d[0] * l1 + s[0] * rest * Math.sign(l2); py[id] = ay + d[1] * l1 + s[1] * rest * Math.sign(l2); }
      }
    }
    for (let i = 0; i < N0; i++) out.set(st[i], [px[i], py[i]]);
    // 交叉点：画线时站间路线要经过它们（netmap.js diagramRoute），江海底图也把它们当控制点
    out.via = new Map(); for (const v of via) out.via.set(st[v.a] + '|' + st[v.b], v.v.map(function (i) { return [px[i], py[i]]; }));
    out.virt = []; for (let i = N0; i < N; i++) out.virt.push({ g: [gx[i], gy[i]], p: [px[i], py[i]] });
    return out;
  }
  CM.NetLayout = { solve: solve };
})(window.CM);
