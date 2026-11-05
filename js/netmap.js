'use strict';
// 线路图：地理线网准确保留站线与地形关系；简洁示意突出线路、支线、环线与换乘关系。
// 地下 / 地面 / 高架用不同线型区分；站内换乘与站外（步行）换乘分别标示；站名避让线路、车站与其他站名
(function (CM) {
  const AX = CM.Accessibility;
  const U = CM.U, M = CM.Metro, h = U.h;
  let ui = null, root = null, view = null, focus = null, useDraft = false, openedGameId = null;
  function game() { return CM.game; }

  // 站外换乘：两座不同线路的运营车站之间可步行换乘（来自交通模型，只在正式网络上有）
  function walkTransfers(g, net) {
    const out = [], mnet = g.model && g.model.net;
    if (!mnet || !mnet.acc) return out;
    const C = mnet.C, seen = new Set();
    for (const t of mnet.acc.transfers) {
      const a = C.stations[t.a].id, b = C.stations[t.b].id, key = a < b ? a + '|' + b : b + '|' + a;
      if (seen.has(key) || !net.stations[a] || !net.stations[b]) continue;
      const la = M.stationLines(net, a), lb = M.stationLines(net, b);
      if (!la.length || !lb.length || la.some(function (l) { return lb.indexOf(l) >= 0; })) continue;
      seen.add(key); out.push({ a: a, b: b, m: t.m });
    }
    return out;
  }

  // 两种布局都从真实网络取站点、区间及换乘；简洁图另行排布八方向线路。
  function layout(net, xfers) {
    const pairs = new Map();
    for (const id in net.segments) {
      const s = net.segments[id];
      if (!net.stations[s.a] || !net.stations[s.b] || !net.lines[s.line]) continue;
      const k = s.a < s.b ? s.a + '|' + s.b : s.b + '|' + s.a;
      let e = pairs.get(k);
      if (!e) { e = { a: s.a, b: s.b, lines: [] }; pairs.set(k, e); }
      if (!e.lines.some(function (x) { return x.lid === s.line; })) e.lines.push({ lid: s.line, type: s.type });
    }
    const st = [], ix = new Map();
    const add = function (sid) { if (!ix.has(sid)) { ix.set(sid, st.length); st.push(sid); } };
    pairs.forEach(function (e) { add(e.a); add(e.b); });
    const N = st.length;
    const edges = [];
    pairs.forEach(function (e) { const A = net.stations[e.a], B = net.stations[e.b]; edges.push({ a: ix.get(e.a), b: ix.get(e.b), lines: e.lines, geo: U.dist(A.x, A.y, B.x, B.y) }); });
    const xEdges = [];
    for (const t of xfers) if (ix.has(t.a) && ix.has(t.b)) xEdges.push({ a: ix.get(t.a), b: ix.get(t.b), xfer: true, len: 0.75 });
    if (!N) return { st: st, edges: edges, xEdges: xEdges, nb: [] };
    const lens = edges.map(function (e) { return e.geo; }).sort(function (a, b) { return a - b; });
    const L = Math.max(0.5, lens[Math.floor(lens.length / 2)]);
    const nb = st.map(function () { return []; });
    for (const e of edges) { nb[e.a].push(e.b); nb[e.b].push(e.a); }
    return { st: st, edges: edges, xEdges: xEdges, nb: nb, L: L };
  }

  const cross = function (ax, ay, bx, by) { return ax * by - ay * bx; };
  function cleanPoints(points) {
    const out = [];
    for (const p of points) {
      if (out.length && Math.hypot(p[0] - out[out.length - 1][0], p[1] - out[out.length - 1][1]) < 1e-9) continue;
      while (out.length > 1) { const a = out[out.length - 2], b = out[out.length - 1], ux = b[0] - a[0], uy = b[1] - a[1], vx = p[0] - b[0], vy = p[1] - b[1]; if (Math.abs(cross(ux, uy, vx, vy)) > 1e-9 || ux * vx + uy * vy < 0) break; out.pop(); }
      out.push(p.slice());
    }
    return out;
  }
  function simplifyPoints(points, tolerance, closed) {
    let src = points;
    if (closed && src.length > 1 && U.dist(src[0][0], src[0][1], src[src.length - 1][0], src[src.length - 1][1]) < 1e-6) src = src.slice(0, -1);
    const reduce = function (p) {
      if (p.length < 3) return p;
      const keep = new Set([0, p.length - 1]), stack = [[0, p.length - 1]];
      while (stack.length) {
        const range = stack.pop(), a = p[range[0]], b = p[range[1]], dx = b[0] - a[0], dy = b[1] - a[1], len = dx * dx + dy * dy;
        let furthest = -1, max = tolerance * tolerance;
        for (let i = range[0] + 1; i < range[1]; i++) { const q = p[i], t = len ? U.clamp(((q[0] - a[0]) * dx + (q[1] - a[1]) * dy) / len, 0, 1) : 0, d = Math.pow(q[0] - a[0] - dx * t, 2) + Math.pow(q[1] - a[1] - dy * t, 2); if (d > max) { max = d; furthest = i; } }
        if (furthest >= 0) { keep.add(furthest); stack.push([range[0], furthest], [furthest, range[1]]); }
      }
      return p.filter(function (v, i) { return keep.has(i); });
    };
    if (!closed) return reduce(src);
    if (src.length < 5) return src;
    const mid = Math.floor(src.length / 2), out = reduce(src.slice(0, mid + 1)).slice(0, -1).concat(reduce(src.slice(mid).concat([src[0]])).slice(0, -1));
    return out.length >= 3 ? out : src;
  }
  function roundRoute(points, radius, closed) {
    const p = cleanPoints(points), samples = [], f = function (p) { return p[0].toFixed(3) + ' ' + p[1].toFixed(3); };
    if (p.length < 2) return { d: p.length ? 'M' + f(p[0]) : '', samples: p };
    const corner = function (i) {
      const a = p[(i - 1 + p.length) % p.length], b = p[i], c = p[(i + 1) % p.length], da = U.dist(a[0], a[1], b[0], b[1]), dc = U.dist(c[0], c[1], b[0], b[1]), r = Math.min(typeof radius === 'function' ? radius(b, i) : radius, da * 0.4, dc * 0.4);
      return { b: b, round: r, before: [b[0] + (a[0] - b[0]) * r / (da || 1), b[1] + (a[1] - b[1]) * r / (da || 1)], after: [b[0] + (c[0] - b[0]) * r / (dc || 1), b[1] + (c[1] - b[1]) * r / (dc || 1)] };
    };
    const first = closed ? corner(0).after : p[0]; let d = 'M' + f(first); samples.push(first);
    for (let k = 1; k < p.length + (closed ? 1 : 0); k++) {
      if (!closed && k === p.length - 1) { d += 'L' + f(p[k]); samples.push(p[k]); continue; }
      const c = corner(k % p.length); d += 'L' + f(c.before); samples.push(c.before);
      if (c.round > 0) { d += 'Q' + f(c.b) + ' ' + f(c.after); for (let j = 1; j <= 8; j++) { const t = j / 8, u = 1 - t; samples.push([u * u * c.before[0] + 2 * u * t * c.b[0] + t * t * c.after[0], u * u * c.before[1] + 2 * u * t * c.b[1] + t * t * c.after[1]]); } }
    }
    return { d: d + (closed ? 'Z' : ''), samples: samples };
  }
  function octilinearOptions(a, b) {
    const dx = b[0] - a[0], dy = b[1] - a[1], sx = Math.sign(dx), sy = Math.sign(dy), m = Math.min(Math.abs(dx), Math.abs(dy)), out = [];
    if (Math.min(Math.abs(dx), Math.abs(dy), Math.abs(Math.abs(dx) - Math.abs(dy))) < 8) out.push([a, b]);
    out.push([a, [a[0] + sx * m, a[1] + sy * m], b], [a, [b[0] - sx * m, b[1] - sy * m], b]);
    if (Math.abs(dx) > Math.abs(dy)) { const l = (Math.abs(dx) - Math.abs(dy)) / 2; out.push([a, [a[0] + sx * l, a[1]], [b[0] - sx * l, b[1]], b]); }
    else { const l = (Math.abs(dy) - Math.abs(dx)) / 2; out.push([a, [a[0], a[1] + sy * l], [b[0], b[1] - sy * l], b]); }
    for (const t of [0.35, 0.5, 0.65]) { const x = a[0] + dx * t, y = a[1] + dy * t; out.push([a, [x, a[1]], [x, b[1]], b], [a, [a[0], y], [b[0], y], b]); }
    const seen = new Set();
    return out.map(cleanPoints).filter(function (p) { const key = p.map(function (v) { return v[0].toFixed(6) + ',' + v[1].toFixed(6); }).join(';'); if (seen.has(key)) return false; seen.add(key); return true; });
  }
  function diagramRoute(track, net, base) {
    const s = track.seg, a = base(net.stations[s.a].x, net.stations[s.a].y), b = base(net.stations[s.b].x, net.stations[s.b].y);
    const tangent = function (sid, other) {
      const p = base(net.stations[sid].x, net.stations[sid].y), end = base(net.stations[other].x, net.stations[other].y), len = U.dist(p[0], p[1], end[0], end[1]) || 1;
      let dx = (end[0] - p[0]) / len, dy = (end[1] - p[1]) / len, best = null, dot = 0.4;
      for (const id in net.segments) { const e = net.segments[id]; if (e.line !== s.line || e.id === s.id || (e.a !== sid && e.b !== sid)) continue; const o = net.stations[e.a === sid ? e.b : e.a], q = base(o.x, o.y), l = U.dist(p[0], p[1], q[0], q[1]) || 1, ox = (q[0] - p[0]) / l, oy = (q[1] - p[1]) / l, d = dx * ox + dy * oy; if (d < dot) { dot = d; best = [ox, oy]; } }
      if (best) { dx -= best[0]; dy -= best[1]; }
      const angle = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * Math.PI / 4; return [Math.cos(angle), Math.sin(angle)];
    };
    const ta = tangent(s.a, s.b), tb = tangent(s.b, s.a), arm = Math.min(20, U.dist(a[0], a[1], b[0], b[1]) / 5);
    const aa = [a[0] + ta[0] * arm, a[1] + ta[1] * arm], bb = [b[0] + tb[0] * arm, b[1] + tb[1] * arm];
    let best = null;
    const inspect = function (raw, radius, fallback) {
      const clean = cleanPoints(raw), rounded = roundRoute(clean, radius, false);
      let obstacles = 0;
      for (const node of base.nodes) {
        if (node.id === s.a || node.id === s.b) continue;
        for (let i = 1; i < rounded.samples.length; i++) {
          const p = rounded.samples[i - 1], q = rounded.samples[i], dx = q[0] - p[0], dy = q[1] - p[1], len = dx * dx + dy * dy;
          const t = len ? U.clamp(((node.p[0] - p[0]) * dx + (node.p[1] - p[1]) * dy) / len, 0, 1) : 0;
          if (U.dist(node.p[0], node.p[1], p[0] + t * dx, p[1] + t * dy) < 16) { obstacles++; break; }
        }
      }
      let length = 0; for (let i = 1; i < clean.length; i++) length += U.dist(clean[i - 1][0], clean[i - 1][1], clean[i][0], clean[i][1]);
      const score = obstacles * 1e6 + length + clean.length * 22 + (18 - radius) * 0.5 + (fallback ? 4 : 0);
      if (!best || score < best.score) best = { raw: clean, radius: radius, samples: rounded.samples, obstacles: obstacles, score: score };
    };
    for (const raw of octilinearOptions(a, b)) inspect(raw, 18, false);
    if (!best.obstacles) return best;
    for (const raw of octilinearOptions(aa, bb)) inspect([a].concat(raw, [b]), 14, false);
    if (best.obstacles) for (const offset of [20, -20, 36, -36, 64, -64, 96, -96, 160, -160, 256, -256]) {
      const x = (a[0] + b[0]) / 2 + offset, y = (a[1] + b[1]) / 2 + offset;
      inspect([a, [a[0], y], [b[0], y], b], 18, false);
      inspect([a, [x, a[1]], [x, b[1]], b], 18, false);
    }
    if (best.obstacles) for (const tolerance of [24, 10, 3, 0.5, 0]) {
      const skeleton = (tolerance ? simplifyPoints(track.screen, tolerance, false) : track.screen).slice(), raw = [a];
      skeleton[0] = a; skeleton[skeleton.length - 1] = b;
      for (let i = 1; i < skeleton.length; i++) { const options = octilinearOptions(skeleton[i - 1], skeleton[i]); const choice = options[Math.abs(skeleton[i][0] - skeleton[i - 1][0]) > Math.abs(skeleton[i][1] - skeleton[i - 1][1]) ? 0 : 1] || options[0]; raw.push.apply(raw, choice.slice(1)); }
      for (const radius of [14, 5, 0]) inspect(raw, radius, true);
      if (!best.obstacles) break;
    }
    // 地图拉直后不让区间穿过无关站标，避免制造不存在的换乘。
    for (let pass = 0; pass < 6 && best.obstacles; pass++) {
      const raw = best.raw;
      for (let i = 1; i < raw.length; i++) {
        const p = raw[i - 1], q = raw[i], len = U.dist(p[0], p[1], q[0], q[1]); if (len < 1) continue;
        const ux = (q[0] - p[0]) / len, uy = (q[1] - p[1]) / len;
        for (const node of base.nodes) {
          if (node.id === s.a || node.id === s.b) continue;
          const along = (node.p[0] - p[0]) * ux + (node.p[1] - p[1]) * uy, normal = -(node.p[0] - p[0]) * uy + (node.p[1] - p[1]) * ux;
          if (along < 0 || along > len || Math.abs(normal) >= 16) continue;
          const t0 = Math.max(0, along - 32), t1 = Math.min(len, along + 32), a = [p[0] + ux * t0, p[1] + uy * t0], b = [p[0] + ux * t1, p[1] + uy * t1];
          for (const side of [32, -32, 64, -64]) inspect(raw.slice(0, i).concat([a, [a[0] - uy * side, a[1] + ux * side], [b[0] - uy * side, b[1] + ux * side], b], raw.slice(i)), 14, true);
        }
      }
      if (raw === best.raw) break;
    }
    return best;
  }

  function projection(net, lay, spacing) {
    const unit = UNIT * spacing;
    const identity = function (size) { return { knots: [[0, 0], [size, size]], map: function (x) { return x; } }; };
    const ax = identity(CM.CFG.W);
    const ay = identity(CM.CFG.H);
    const base = function (x, y) { const q = base.snap && base.snap.get(x + ',' + y); return q ? [q[0] + base.ox, q[1] + base.oy] : [ax.map(x) * unit / lay.L + base.ox, ay.map(y) * unit / lay.L + base.oy]; };
    base.ox = 0; base.oy = 0; base.scale = unit / lay.L; base.ax = ax; base.ay = ay;
    // 两种模式的站点使用同一比例，不能逐轴或局部拉伸站距；简洁图只把接近同一直线的车站对齐（见 straighten）。
    base.path = function (pts, closed) {
      if (!pts.length) return [];
      const out = [base(pts[0][0], pts[0][1])];
      for (let i = 1; i < pts.length + (closed ? 1 : 0); i++) {
        const a = pts[i - 1], b = pts[i % pts.length], cuts = [1];
        cuts.sort(function (a, b) { return a - b; });
        let last = -1;
        for (const t of cuts) { if (t - last < 1e-8) continue; out.push(base(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t)); last = t; }
      }
      return out;
    };
    return base;
  }

  // 简洁图的站位：相邻两站接近水平、竖直或 45° 时排到同一条直线上，线路才能横平竖直，不会因为几像素的错位折出小弯钩。
  // 只在垂直于线路的方向上移动车站，站距基本不变；真正的转弯（整组偏移太大）保持原位，走明确的折线
  function straighten(net, lay, base) {
    const NORMAL = [[0, 1], [1, 0], [Math.SQRT1_2, -Math.SQRT1_2], [Math.SQRT1_2, Math.SQRT1_2]];   // 水平、竖直、两条斜线的法线
    const MIN_SEP = 24, MIN_JOG = 30, CLEAR = 20, SPREAD = 1.6 * base.scale * lay.L;
    const pos = new Map(), groups = [new Map(), new Map(), new Map(), new Map()], edges = [], seen = new Set();
    for (const sid of lay.st) { const s = net.stations[sid]; pos.set(sid, base(s.x, s.y)); }
    const coord = function (id, k) { const p = pos.get(id); return NORMAL[k][0] * p[0] + NORMAL[k][1] * p[1]; };
    const along = function (id, k) { const p = pos.get(id); return NORMAL[k][0] * p[1] - NORMAL[k][1] * p[0]; };
    const shift = function (id, k, d) { const p = pos.get(id); p[0] += NORMAL[k][0] * d; p[1] += NORMAL[k][1] * d; };
    for (const id in net.segments) {
      const s = net.segments[id]; if (!net.lines[s.line] || !pos.has(s.a) || !pos.has(s.b)) continue;
      const key = s.a < s.b ? s.a + '|' + s.b : s.b + '|' + s.a; if (seen.has(key)) continue; seen.add(key);
      const pa = pos.get(s.a), pb = pos.get(s.b), dx = pb[0] - pa[0], dy = pb[1] - pa[1], ax = Math.abs(dx), ay = Math.abs(dy);
      const k = ay <= ax * 0.414 ? 0 : (ax <= ay * 0.414 ? 1 : (dx * dy > 0 ? 2 : 3));
      edges.push({ a: s.a, b: s.b, k: k, off: Math.abs(NORMAL[k][0] * dx + NORMAL[k][1] * dy) });
    }
    edges.sort(function (a, b) { return a.off - b.off; });
    const groupOf = function (k, id) { let G = groups[k].get(id); if (!G) { G = { k: k, ids: [id], edges: [] }; groups[k].set(id, G); } return G; };
    const settle = function (G) { let m = 0; for (const id of G.ids) m += coord(id, G.k); m /= G.ids.length; for (const id of G.ids) shift(id, G.k, m - coord(id, G.k)); };
    const between = function (id, e, k) { const t = along(id, k), a = along(e.a, k), b = along(e.b, k); return t > Math.min(a, b) - 1 && t < Math.max(a, b) + 1; };
    const mayJoin = function (A, B, e) {
      const k = e.k, ids = A.ids.concat(B.ids);
      let lo = Infinity, hi = -Infinity; for (const id of ids) { const c = coord(id, k); lo = Math.min(lo, c); hi = Math.max(hi, c); }
      if (hi - lo > SPREAD && e.off >= MIN_JOG) return false;
      // 不能和同一行的其他车站重叠，也不能落在别的区间中间（看起来会像换乘）
      for (const i of A.ids) for (const j of B.ids) if (!(i === e.a && j === e.b || i === e.b && j === e.a) && Math.abs(along(i, k) - along(j, k)) < MIN_SEP) return false;
      for (const x of A.edges.concat(B.edges, [e])) for (const id of ids) if (id !== x.a && id !== x.b && between(id, x, k)) return false;
      return true;
    };
    for (const e of edges) {
      const A = groupOf(e.k, e.a), B = groupOf(e.k, e.b);
      if (A === B) { A.edges.push(e); continue; }
      if (!mayJoin(A, B, e)) continue;
      for (const id of B.ids) { A.ids.push(id); groups[e.k].set(id, A); }
      A.edges = A.edges.concat(B.edges, [e]);
      settle(A);
    }
    // 一座车站可能同时在水平行和竖直列（或斜线）上：反复投影，最后一轮水平、竖直保证精确
    const all = []; for (const k of [2, 3, 0, 1]) { const set = new Set(groups[k].values()); for (const G of set) if (G.ids.length > 1) all.push(G); }
    for (let pass = 0; pass < 24; pass++) for (const G of all) settle(G);
    // 对齐后不让区间压在无关车站上：把那座车站（连同它所在的平行行）移开，而不是让线路绕一个小弯
    for (let pass = 0; pass < 8; pass++) {
      let moved = false;
      for (const k of [0, 1]) for (const G of new Set(groups[k].values())) for (const e of G.edges) for (const id of pos.keys()) {
        if (id === e.a || id === e.b || G.ids.indexOf(id) >= 0 || !between(id, e, k)) continue;
        const d = coord(id, k) - coord(e.a, k); if (Math.abs(d) >= CLEAR) continue;
        const H = groupOf(k, id), step = (d >= 0 ? 1 : -1) * (CLEAR - Math.abs(d) + 4);
        for (const m of H.ids) shift(m, k, step);
        moved = true;
      }
      if (!moved) break;
    }
    base.snap = new Map();
    for (const sid of lay.st) { const s = net.stations[sid]; base.snap.set(s.x + ',' + s.y, pos.get(sid)); }
  }

  // 地理线网中，地形、实际轨道和车站共用等比例投影；不移动岸线或省略小水面。
  let showTerrain = true, geographic = true;
  function terrainSVG(net, lay, base, boxes) {
    if (!geographic) return '';
    const Geo = CM.Geo, city = game() && game().city;
    if (!Geo || !Geo.water || !lay.L) return '';
    const f = function (v) { return v.toFixed(2); };
    const points = function (p, closed) {
      const src = []; for (let k = 0; k + 1 < p.length; k += 2) src.push([p[k], p[k + 1]]);
      const out = base.path(src, closed);
      return out.length ? pathPoints(out) : '';
    };
    const polygon = function (feat) { return feat.rings.map(function (r) { const d = points(r.p, true); return d ? d + 'Z' : ''; }).join(''); };
    const inMap = function (b) { return b && b[2] >= 0 && b[0] <= CM.CFG.W && b[3] >= 0 && b[1] <= CM.CFG.H; };
    const named = [];
    const features = function (feats, cls) {
      let out = '';
      for (const feat of feats) {
        if (!inMap(feat.bbox)) continue;
        const d = polygon(feat, cls);
        if (d) out += '<path class="' + cls + '" fill-rule="evenodd" d="' + d + '"/>';
        if (cls === 'nm-water' && feat.name && feat.rings.length) {
          const p = feat.rings[0].p, k = Math.floor(p.length / 4) * 2;
          if (k + 1 < p.length) named.push({ name: feat.name, q: base(p[k], p[k + 1]), size: (feat.bbox[2] - feat.bbox[0]) * (feat.bbox[3] - feat.bbox[1]) });
        }
      }
      return out;
    };
    const greenFeats = Geo.reserves.concat(Geo.woods, Geo.parks);
    const green = features(greenFeats, 'nm-green');
    let water = features(Geo.water, 'nm-water'), rivers = '';
    // 历史上尚未填出的土地仍是水面，沿用城市系统当前年份的几何。
    if (city && city.reclaimWater) water += features(city.reclaimWater(), 'nm-water');
    for (const river of Geo.waterLines) {
      if (!inMap(river.bbox)) continue;
      // 地理模式直接绘制原河道及其等比例宽度。
      const d = points(river.p); if (!d) continue;
      rivers += '<path d="' + d + '" stroke-width="' + f(Math.max(river.w, 0.05) * base.scale) + '"/>';
      const k = Math.floor(river.p.length / 4) * 2;
      if (river.name && k + 1 < river.p.length) named.push({ name: river.name, q: base(river.p[k], river.p[k + 1]), size: river.p.length });
    }
    let labels = ''; const seen = new Set();
    named.sort(function (a, b) { return b.size - a.size; });
    for (const item of named) {
      const q = item.q;
      if (seen.has(item.name) || seen.size >= 6 || q[0] < 0 || q[0] > lay.vw || q[1] < 0 || q[1] > lay.vh) continue;
      const tw = item.name.length * 13 + 6, box = [q[0] - tw / 2, q[1] - 9, q[0] + tw / 2, q[1] + 9];
      if (boxes.some(function (b) { return Math.min(box[2], b[2]) > Math.max(box[0], b[0]) && Math.min(box[3], b[3]) > Math.max(box[1], b[1]); })) continue;
      seen.add(item.name); boxes.push(box);
      labels += '<text x="' + f(q[0]) + '" y="' + f(q[1] + 4.5) + '" text-anchor="middle" class="nm-wlabel">' + U.esc(item.name) + '</text>';
    }
    const a = base(0, 0), b = base(CM.CFG.W, CM.CFG.H);
    const clip = '<rect x="' + f(a[0]) + '" y="' + f(a[1]) + '" width="' + f(b[0] - a[0]) + '" height="' + f(b[1] - a[1]) + '"/>';
    return '<defs><clipPath id="nmGeoClip">' + clip + '</clipPath></defs>' +
      '<g class="nm-terrain" clip-path="url(#nmGeoClip)" stroke-linejoin="round" stroke-linecap="round">' + green + water + '<g class="nm-river" fill="none">' + rivers + '</g>' + labels + '</g>';
  }

  // ---------------- 绘制 ----------------
  const UNIT = 96;
  const LABEL_SIZE = 20;
  const TYPE_NAME = { underground: '地下', surface: '地面', elevated: '高架' };
  const pathPoints = function (pts) { const digits = geographic ? 2 : 3; return 'M' + pts.map(function (p) { return p[0].toFixed(digits) + ' ' + p[1].toFixed(digits); }).join('L'); };
  function routeD(entry) { return entry.route ? roundRoute(entry.route.raw, entry.route.radius, false).d : pathPoints(entry.screen); }
  function geoSeg(entry, base, net, width) {
    const s = entry.seg, L = net.lines[s.line];
    const d = routeD(entry);
    let out = '<g data-line="' + s.line + '" data-segment="' + s.id + '"><title>' + U.esc(L.name + ' · ' + TYPE_NAME[s.type] + '区间') + '</title><path d="' + d + '" stroke="' + AX.line(L) + '" stroke-width="' + width + '"/>';
    if (s.type === 'elevated') out += '<path d="' + d + '" class="nm-elev"/>';
    else if (s.type === 'surface') out += '<path d="' + d + '" class="nm-surf"/>';
    return out + '</g>';
  }
  // 将并排行道的站台包在一个圆角外框内，避免连接底形与圆形站标叠出双重轮廓。
  const LEVEL_ROWS = ['elevated', 'surface', 'underground'], LEVEL_COL = { elevated: '#f59f45', surface: '#4fbf7f', underground: '#6f9bff' };
  function levelBadge(x, y, hh, types) {
    const f = function (v) { return v.toFixed(1); }, w = hh * 0.9, bw = w * 0.62, bh = hh * 0.17, gap = (hh - 3 * bh) / 4;
    let out = '<g class="nm-lv"><rect x="' + f(x - w / 2) + '" y="' + f(y - hh / 2) + '" width="' + f(w) + '" height="' + f(hh) + '" rx="' + f(hh * 0.24) + '" fill="#25334a" stroke="#fff" stroke-width="1.4"/>';
    for (let k = 0; k < 3; k++) out += '<rect x="' + f(x - bw / 2) + '" y="' + f(y - hh / 2 + gap + k * (bh + gap)) + '" width="' + f(bw) + '" height="' + f(bh) + '" rx="' + f(bh / 2) + '" fill="' + (types.indexOf(LEVEL_ROWS[k]) >= 0 ? LEVEL_COL[LEVEL_ROWS[k]] : 'rgba(255,255,255,0.18)') + '"/>';
    return out + '</g>';
  }
  // 线路风格的换乘站（本游戏自己的设计），都带各线路的颜色
  // 按线路分段的圆环：一条线时是整圈
  function lineRing(cx, cy, R, cols, w, gap, cap) {
    const f = function (v) { return v.toFixed(2); }, n = cols.length;
    if (n < 2) return '<circle cx="' + f(cx) + '" cy="' + f(cy) + '" r="' + f(R) + '" fill="none" stroke="' + cols[0] + '" stroke-width="' + f(w) + '"/>';
    return cols.map(function (c, k) {
      const a0 = -Math.PI / 2 + k * Math.PI * 2 / n + gap / 2, a1 = -Math.PI / 2 + (k + 1) * Math.PI * 2 / n - gap / 2;
      return '<path d="M' + f(cx + Math.cos(a0) * R) + ' ' + f(cy + Math.sin(a0) * R) + 'A' + f(R) + ' ' + f(R) + ' 0 ' + (a1 - a0 > Math.PI ? 1 : 0) + ' 1 ' + f(cx + Math.cos(a1) * R) + ' ' + f(cy + Math.sin(a1) * R) + '" fill="none" stroke="' + c + '" stroke-width="' + f(w) + '" stroke-linecap="' + cap + '"/>';
    }).join('');
  }
  function xferArrows(cx, cy, gs) {
    const f = function (v) { return v.toFixed(1); }, h0 = gs * 0.42, hd = gs * 0.52;
    return '<path class="nm-xg" d="M' + f(cx - gs) + ' ' + f(cy - h0) + 'L' + f(cx + gs) + ' ' + f(cy - h0) + 'L' + f(cx + gs - hd) + ' ' + f(cy - h0 - hd) + 'M' + f(cx + gs) + ' ' + f(cy + h0) + 'L' + f(cx - gs) + ' ' + f(cy + h0) + 'L' + f(cx - gs + hd) + ' ' + f(cy + h0 + hd) + '"/>';
  }
  // 并排车道的换乘站：胶囊顺着车道方向盖住所有车道，每条线路一个小色环
  const LANE_R = 4.5, LANE_W = 3.1;
  function laneCapsule(a, b, far, cols, wo, wf) {
    const f = function (v) { return v.toFixed(2); }, n = cols.length, step = Math.max(13.2, n > 1 ? far / (n - 1) : 0), ux = (b[0] - a[0]) / far, uy = (b[1] - a[1]) / far, cx = (a[0] + b[0]) / 2, cy = (a[1] + b[1]) / 2, half = (n - 1) * step / 2;
    const d = 'M' + f(cx - ux * half) + ' ' + f(cy - uy * half) + 'L' + f(cx + ux * half) + ' ' + f(cy + uy * half);
    return '<path class="nm-xo" d="' + d + '" stroke-width="' + f(wo) + '"/><path class="nm-xf" d="' + d + '" stroke-width="' + f(wf) + '"/>' + cols.map(function (c, k) { const t = -half + k * step; return lineRing(cx + ux * t, cy + uy * t, LANE_R, [c], LANE_W, 0, 'butt'); }).join('');
  }
  // 标准：和地图上一样（比例同 render.js）：深色外环、里面按线路分段的线路色、中间换乘箭头；并排车道时是深色描边的胶囊里一串小色环
  function plainHub(a, b, far, cols, r) {
    if (far) return laneCapsule(a, b, far, cols, 2 * r * 1.15, 2 * r * 0.85);
    const f = function (v) { return v.toFixed(2); }, cx = (a[0] + b[0]) / 2, cy = (a[1] + b[1]) / 2, d = 'M' + f(cx) + ' ' + f(cy) + 'L' + f(cx) + ' ' + f(cy);
    return '<path class="nm-xo" d="' + d + '" stroke-width="' + f(2 * r * 1.15) + '"/><path class="nm-xf" d="' + d + '" stroke-width="' + f(2 * r * 0.85) + '"/>' + lineRing(cx, cy, r * 0.72, cols, r * 0.2, cols.length > 1 ? 0.22 : 0, 'butt') + xferArrows(cx, cy, r * 0.36);
  }
  function stationMark(s, x, y, lines, net, inter, tip, anchors, levels) {
    const attrs = 'data-st="' + s.id + '" data-lines="' + lines.join(' ') + '"', f = function (v) { return v.toFixed(1); };
    // 分层站台至少有两条线路，总是换乘站标志
    const lane = anchors && anchors.length === 1 ? anchors[0] : [x, y];
    if (!inter) return '<circle ' + attrs + ' cx="' + f(lane[0]) + '" cy="' + f(lane[1]) + '" r="' + 6.5 + '" class="nm-st" stroke="' + AX.line(net.lines[lines[0]]) + '"><title>' + U.esc(tip) + '</title></circle>';
    // 换乘站都带各线路的颜色：只有一个位置时是圆（标准风格和地图上一样），有并排车道时是胶囊盖住所有车道
    const r = 10.5, pts = anchors && anchors.length ? anchors : [[x, y]];
    let a = pts[0], b = pts[0], far = -1;
    for (const p of pts) for (const q of pts) { const d = U.dist(p[0], p[1], q[0], q[1]); if (d > far) { far = d; a = p; b = q; } }
    const hubC = anchors && anchors.length > 1 ? [(Math.min.apply(null, anchors.map(function (a) { return a[0]; })) + Math.max.apply(null, anchors.map(function (a) { return a[0]; }))) / 2, (Math.min.apply(null, anchors.map(function (a) { return a[1]; })) + Math.max.apply(null, anchors.map(function (a) { return a[1]; }))) / 2] : lane;
    let out = '<g ' + attrs + ' data-c="' + f(hubC[0]) + ' ' + f(hubC[1]) + '" class="nm-x"><title>' + U.esc(tip) + '</title>';
    const cols = lines.map(function (l) { return AX.line(net.lines[l]); });
    out += plainHub(a, b, far, cols, r);
    if (levels && levels.length > 1) out += levelBadge(x + r * 0.9, y - r * 0.9, 15, levels);
    return out + '</g>';
  }
  // 站名采用实际字体量宽；空间网格让密集线网的避让只查询邻近占位。
  function labelIndex() {
    const cells = new Map(), boxes = [], cell = 64;
    const keys = function (b, visit) {
      for (let x = Math.floor(b[0] / cell); x <= Math.floor(b[2] / cell); x++) for (let y = Math.floor(b[1] / cell); y <= Math.floor(b[3] / cell); y++) visit(x + ':' + y);
    };
    return {
      boxes: boxes,
      add: function (b, weight) {
        const o = { b: b, weight: weight || 1 }; boxes.push(b);
        keys(b, function (key) { if (!cells.has(key)) cells.set(key, []); cells.get(key).push(o); });
      },
      overlap: function (b) {
        let score = 0; const seen = new Set();
        keys(b, function (key) { for (const o of cells.get(key) || []) {
          if (seen.has(o)) continue; seen.add(o);
          const w = Math.min(b[2], o.b[2]) - Math.max(b[0], o.b[0]), hh = Math.min(b[3], o.b[3]) - Math.max(b[1], o.b[1]);
          if (w > 0 && hh > 0) score += w * hh * o.weight;
        } });
        return score;
      }
    };
  }
  function stationText(name, measure) {
    if (CM.I18n) name=CM.I18n.text(String(name));
    const chars = CM.I18n && CM.I18n.get()==='en' && !/[\u3400-\u9fff]/.test(name) ? (name.match(/[^\s-]+(?:-|\s+|$)/g)||[name]) : Array.from(String(name)), width = measure.measureText(name).width;
    if (width <= 112) return [String(name)];
    const count = Math.ceil(width / 112), target = width / count, rows = [];
    let row = '';
    for (const c of chars) {
      if (row && measure.measureText(row + c).width > target + measure.measureText(c).width * 0.4 && rows.length < count - 1) { rows.push(row.trim()); row = ''; }
      row += c;
    }
    if (row) rows.push(row.trim());
    return rows;
  }
  // 以简洁图的直线走廊分配行道，包含不同区间之间的局部重合，而非只比较整段真实几何。
  function parallelRoutes(tracks, net, base) {
    const channels = new Map(), bundles = [], ends = new Map(), stationLines = new Map(), stationAnchors = new Map();
    const EPS = 1e-6, GAP = 14;
    const addEnd = function (sid, track, start) {
      let lines = ends.get(sid); if (!lines) { lines = new Map(); ends.set(sid, lines); }
      let list = lines.get(track.seg.line); if (!list) { list = []; lines.set(track.seg.line, list); }
      list.push({ track: track, start: start });
    };
    for (const track of tracks) {
      const raw = track.route.raw, legs = [];
      for (let i = 1; i < raw.length; i++) {
        const a = raw[i - 1], b = raw[i], length = U.dist(a[0], a[1], b[0], b[1]);
        if (length < EPS) continue;
        const dx = (b[0] - a[0]) / length, dy = (b[1] - a[1]) / length;
        const reverse = dx < -EPS || Math.abs(dx) < EPS && dy < 0, ux = reverse ? -dx : dx, uy = reverse ? -dy : dy;
        const nx = -uy, ny = ux, at = nx * a[0] + ny * a[1];
        const key = Math.round(ux * 1e6) + ':' + Math.round(uy * 1e6) + ':' + Math.round(at * 1e5);
        const t0 = ux * a[0] + uy * a[1], t1 = ux * b[0] + uy * b[1];
        const leg = { a: a, b: b, dx: dx, dy: dy, nx: nx, ny: ny, lo: Math.min(t0, t1), hi: Math.max(t0, t1), line: track.seg.line, offset: 0 };
        if (!channels.has(key)) channels.set(key, []); channels.get(key).push(leg); legs.push(leg);
      }
      track.legs = legs;
      addEnd(track.seg.a, track, true); addEnd(track.seg.b, track, false);
    }
    for (const legs of channels.values()) {
      legs.sort(function (a, b) { return a.lo - b.lo || a.hi - b.hi; });
      // 找出在这条直线上有重合的线路；一条线路在同一条直线上始终走同一个车道，不在站点前后换道（否则会折出小弯钩）
      const shared = new Set(); let group = [], hi = -Infinity;
      const collect = function () { const ls = new Set(group.map(function (leg) { return leg.line; })); if (ls.size > 1) ls.forEach(function (l) { shared.add(l); }); };
      for (const leg of legs) {
        // 仅在一个点相交或接触不能视作共用走廊。
        if (leg.lo >= hi - EPS && group.length) { collect(); group = []; hi = -Infinity; }
        group.push(leg); hi = Math.max(hi, leg.hi);
      }
      if (group.length) collect();
      if (shared.size < 2) continue;
      const bundle = { lines: M.sortIds(Array.from(shared)), legs: legs.filter(function (leg) { return shared.has(leg.line); }), links: [], sign: 0 }; bundles.push(bundle);
      for (const leg of bundle.legs) leg.bundle = bundle;
    }
    // 共用走廊转弯时保持内外顺序；不能在上行 / 下行切换后把并排线路编成交叉。
    const connect = function (a, b, relation) {
      const x = a && a.bundle, y = b && b.bundle;
      if (!x || !y || x === y || x.lines.filter(function (lid) { return y.lines.indexOf(lid) >= 0; }).length < 2) return;
      x.links.push({ bundle: y, relation: relation }); y.links.push({ bundle: x, relation: relation });
    };
    const side = function (leg) { return Math.sign(cross(leg.dx, leg.dy, leg.nx, leg.ny)); };
    for (const track of tracks) for (let i = 1; i < track.legs.length; i++) connect(track.legs[i - 1], track.legs[i], side(track.legs[i - 1]) * side(track.legs[i]));
    for (const lines of ends.values()) for (const list of lines.values()) for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
      const a = list[i], b = list[j], al = a.track.legs[a.start ? 0 : a.track.legs.length - 1], bl = b.track.legs[b.start ? 0 : b.track.legs.length - 1];
      if (al && bl) connect(al, bl, -side(al) * (a.start ? 1 : -1) * side(bl) * (b.start ? 1 : -1));
    }
    for (const first of bundles) {
      if (first.sign) continue;
      first.sign = first.legs[0].nx < -EPS ? -1 : 1;
      const queue = [first];
      for (let i = 0; i < queue.length; i++) for (const link of queue[i].links) if (!link.bundle.sign) { link.bundle.sign = queue[i].sign * link.relation; queue.push(link.bundle); }
    }
    for (const bundle of bundles) {
      const offsets = new Map(bundle.lines.map(function (lid, i) { return [lid, (i - (bundle.lines.length - 1) / 2) * GAP * bundle.sign]; }));
      for (const leg of bundle.legs) leg.offset = offsets.get(leg.line);
    }
    const intersection = function (p, u, q, v) {
      const det = cross(u[0], u[1], v[0], v[1]); if (Math.abs(det) < EPS) return null;
      const t = cross(q[0] - p[0], q[1] - p[1], v[0], v[1]) / det;
      return [p[0] + u[0] * t, p[1] + u[1] * t];
    };
    const shifted = function (p, leg) { return [p[0] + leg.nx * leg.offset, p[1] + leg.ny * leg.offset]; };
    for (const track of tracks) {
      const legs = track.legs, raw = [];
      if (!legs.length) continue;
      raw.push(shifted(legs[0].a, legs[0]));
      for (let i = 1; i < legs.length; i++) {
        const a = legs[i - 1], b = legs[i], p = shifted(a.b, a), q = shifted(b.a, b);
        const join = intersection(p, [a.dx, a.dy], q, [b.dx, b.dy]);
        const cap = Math.max(GAP * 2, Math.max(Math.abs(a.offset), Math.abs(b.offset)) * 3);
        if (join && U.dist(join[0], join[1], a.b[0], a.b[1]) <= cap) raw.push(join);
        else { raw.push(p); if (U.dist(p[0], p[1], q[0], q[1]) > EPS) raw.push(q); }
      }
      raw.push(shifted(legs[legs.length - 1].b, legs[legs.length - 1]));
      track.route.raw = cleanPoints(raw);
    }
    for (const [sid, lines] of ends) {
      const s = net.stations[sid], center = base(s.x, s.y), anchors = [];
      const byLine = new Map(); stationLines.set(sid, byLine);
      for (const [lid, list] of lines) {
        const points = list.map(function (e) { const p = e.track.route.raw; return e.start ? p[0] : p[p.length - 1]; });
        let anchor = [points.reduce(function (v, p) { return v + p[0]; }, 0) / points.length, points.reduce(function (v, p) { return v + p[1]; }, 0) / points.length];
        if (list.length === 2) {
          const dirs = list.map(function (e) { const p = e.track.route.raw, a = e.start ? p[0] : p[p.length - 1], b = e.start ? p[1] : p[p.length - 2]; return [b[0] - a[0], b[1] - a[1]]; });
          const join = intersection(points[0], dirs[0], points[1], dirs[1]);
          if (join && U.dist(join[0], join[1], center[0], center[1]) <= GAP * (lines.size + 1)) anchor = join;
        }
        byLine.set(lid, anchor); anchors.push(anchor);
      }
      stationAnchors.set(sid, anchors);
    }
    const attach = function (points, anchor) {
      const p = points[0], q = points[1], length = U.dist(p[0], p[1], q[0], q[1]);
      if (U.dist(p[0], p[1], anchor[0], anchor[1]) < EPS) { points[0] = anchor.slice(); return points; }
      const ux = (q[0] - p[0]) / (length || 1), uy = (q[1] - p[1]) / (length || 1);
      const along = (anchor[0] - p[0]) * ux + (anchor[1] - p[1]) * uy;
      const side = Math.abs(cross(ux, uy, anchor[0] - p[0], anchor[1] - p[1]));
      const t = Math.max(0, along) + side;
      const join = t < length * 0.8 ? [p[0] + ux * t, p[1] + uy * t] : p;
      return cleanPoints([anchor.slice(), join].concat(points.slice(1)));
    };
    for (const track of tracks) {
      let raw = track.route.raw;
      if (raw.length < 2) continue;
      raw = attach(raw, stationLines.get(track.seg.a).get(track.seg.line));
      raw = attach(raw.slice().reverse(), stationLines.get(track.seg.b).get(track.seg.line)).reverse();
      track.route.raw = raw; track.route.samples = roundRoute(raw, track.route.radius, false).samples; track.screen = track.route.samples;
    }
    return stationAnchors;
  }
  function build(g, spacing, attempt) {
    spacing = spacing || 1; attempt = attempt || 0;
    const net = useDraft && g.draft ? g.draft.net : g.net;
    const xfers = walkTransfers(g, net);
    const lay = layout(net, xfers);
    const N = lay.st.length;
    if (!N) return h('div', { class: 'nm-empty' }, CM.icon('network', 40), h('div', null, useDraft ? '草案中还没有轨道。' : '还没有运营线路。'), h('div', { class: 'tiny muted' }, '用「绘线」工具连接两座以上的车站，确认建设后会显示在这里。'));
    const base = projection(net, lay, spacing);
    if (!geographic) straighten(net, lay, base);
    if (!geographic) base.nodes = lay.st.map(function (sid) { const s = net.stations[sid]; return { id: sid, p: base(s.x, s.y) }; });
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    const bound = function (p) { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); };
    for (const sid of lay.st) { const s = net.stations[sid]; bound(base(s.x, s.y)); }
    const tracks = [], sharedRoutes = new Map();
    for (const id of M.sortIds(Object.keys(net.segments))) {
      const s = net.segments[id];
      if (!net.lines[s.line] || !net.stations[s.a] || !net.stations[s.b]) continue;
      const geom = M.segGeom(net, s, g.city), screen = base.path(geom.pts);
      const track = { seg: s, geom: geom, screen: screen };
      if (!geographic) {
        const points = geom.pts.map(function (p) { return p[0].toFixed(6) + ',' + p[1].toFixed(6); }), forward = points.join(';'), reverse = points.slice().reverse().join(';'), key = forward < reverse ? forward : reverse, previous = sharedRoutes.get(key);
        if (previous) {
          const same = previous.forward === forward, route = previous.route;
          track.route = Object.assign({}, route, { raw: route.raw.map(function (p) { return p.slice(); }), samples: route.samples.map(function (p) { return p.slice(); }) });
          if (!same) { track.route.raw.reverse(); track.route.samples.reverse(); }
        } else { track.route = diagramRoute(track, net, base); sharedRoutes.set(key, { forward: forward, route: track.route }); }
        track.screen = track.route.samples;
      }
      tracks.push(track);
    }
    const stationAnchors = !geographic ? parallelRoutes(tracks, net, base) : new Map();
    for (const track of tracks) track.screen.forEach(bound);
    for (const anchors of stationAnchors.values()) anchors.forEach(bound);
    const pad = 64, W = x1 - x0 + 2 * pad, H = y1 - y0 + 2 * pad;
    base.ox = pad - x0; base.oy = pad - y0;
    for (const track of tracks) {
      for (const p of track.screen) { p[0] += base.ox; p[1] += base.oy; }
      if (track.route) for (const p of track.route.raw) { p[0] += base.ox; p[1] += base.oy; }
    }
    for (const anchors of stationAnchors.values()) for (const p of anchors) { p[0] += base.ox; p[1] += base.oy; }
    const positions = lay.st.map(function (sid) { const s = net.stations[sid]; return base(s.x, s.y); });
    const px = function (i) { return positions[i][0]; }, py = function (i) { return positions[i][1]; };
    const linesOf = lay.st.map(function () { return []; });
    for (const e of lay.edges) for (const l of e.lines) { if (linesOf[e.a].indexOf(l.lid) < 0) linesOf[e.a].push(l.lid); if (linesOf[e.b].indexOf(l.lid) < 0) linesOf[e.b].push(l.lid); }
    const walkSet = new Set(); for (const e of lay.xEdges) { walkSet.add(e.a); walkSet.add(e.b); }
    // 占位：车站、线路（每 9 px 一个小方块）
    const index = labelIndex(), boxes = index.boxes;
    const overlap = index.overlap;
    const extent = [0, 0, W, H];
    const expand = function (b) { extent[0] = Math.min(extent[0], b[0] - 20); extent[1] = Math.min(extent[1], b[1] - 20); extent[2] = Math.max(extent[2], b[2] + 20); extent[3] = Math.max(extent[3], b[3] + 20); };
    for (let i = 0; i < N; i++) {
      const r = linesOf[i].length > 1 || walkSet.has(i) ? 14 : 10, anchors = stationAnchors.get(lay.st[i]) || [];
      const xs = [px(i)].concat(anchors.map(function (p) { return p[0]; })), ys = [py(i)].concat(anchors.map(function (p) { return p[1]; }));
      const box = [Math.min.apply(null, xs) - r, Math.min.apply(null, ys) - r, Math.max.apply(null, xs) + r, Math.max.apply(null, ys) + r];
      index.add(box, 8); expand(box);
    }
    const occupy = function (pts) {
      let length = 0, next = 9;
      for (let k = 1; k < pts.length; k++) {
        const a = pts[k - 1], b = pts[k], d = Math.hypot(b[0] - a[0], b[1] - a[1]);
        while (d > 0 && next < length + d) { const t = (next - length) / d, x = a[0] + (b[0] - a[0]) * t, y = a[1] + (b[1] - a[1]) * t; index.add([x - 6, y - 6, x + 6, y + 6]); next += 9; }
        length += d;
      }
    };
    for (const track of tracks) occupy(track.screen);
    for (const e of lay.xEdges) occupy([[px(e.a), py(e.a)], [px(e.b), py(e.b)]]);
    const origin = base(0, 0);
    const axes = ' data-projection="' + (geographic ? 'geographic' : 'octilinear') + '" data-axis-x="' + JSON.stringify(base.ax.knots.map(function (k) { return [k[0], base(k[0], 0)[0]]; })) + '" data-axis-y="' + JSON.stringify(base.ay.knots.map(function (k) { return [k[0], base(0, k[0])[1]]; })) + '"';
    let svg = '<svg class="nm-svg" data-mode="' + (geographic ? 'geographic' : 'schematic') + '" data-spacing="' + spacing + '"' + axes + ' data-scale="' + base.scale + '" data-origin-x="' + origin[0] + '" data-origin-y="' + origin[1] + '" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + W.toFixed(0) + ' ' + H.toFixed(0) + '">';
    // 站外换乘连线（虚线）
    svg += '<g class="nm-walk">';
    for (const e of lay.xEdges) svg += '<path data-lines="' + Array.from(new Set(linesOf[e.a].concat(linesOf[e.b]))).join(' ') + '" d="M' + px(e.a).toFixed(1) + ' ' + py(e.a).toFixed(1) + 'L' + px(e.b).toFixed(1) + ' ' + py(e.b).toFixed(1) + '"/>';
    svg += '</g>';
    // 简洁图共用走廊并排，地理图沿用真实中心线及同心色带，不平移实际位置。
    let casing = '', routes = '';
    if (!geographic) {
      for (const track of tracks) {
        const width = (track.seg.type === 'elevated' ? 9.5 : 8), d = routeD(track);
        casing += '<path data-lines="' + track.seg.line + '" d="' + d + '" stroke-width="' + (width + 3) + '"/>';
        routes += geoSeg(track, base, net, width);
      }
    } else {
      const groups = new Map();
      for (const track of tracks) {
        const pts = track.geom.pts.map(function (p) { return p[0].toFixed(6) + ',' + p[1].toFixed(6); });
        const forward = pts.join(';'), reverse = pts.slice().reverse().join(';'), key = forward < reverse ? forward : reverse;
        if (!groups.has(key)) groups.set(key, []); groups.get(key).push(track);
      }
      for (const group of groups.values()) {
        const widths = group.map(function (track, i) { return (track.seg.type === 'elevated' ? 9.5 : 8) + (group.length - 1 - i) * 4; });
        const entry = group[0], d = routeD(entry);
        casing += '<path data-lines="' + group.map(function (track) { return track.seg.line; }).join(' ') + '" d="' + d + '" stroke-width="' + (Math.max.apply(null, widths) + 3) + '"/>';
        group.forEach(function (track, i) { routes += geoSeg(track, base, net, widths[i]); });
      }
    }
    svg += '<g class="nm-casing" fill="none" stroke-linecap="round" stroke-linejoin="round">' + casing + '</g><g class="nm-lines" stroke-linecap="round" stroke-linejoin="round" fill="none">' + routes + '</g>';
    const measure = document.createElement('canvas').getContext('2d'), font = getComputedStyle(document.body).fontFamily;
    // 终点编号也参与避让，不盖住相邻车站和线路；长编号按文字宽度扩展。
    const leaves = new Set(); for (const lid in net.lines) { const tp = M.lineTopo(net, lid); if (tp.leaves) for (const sid of tp.leaves) leaves.add(sid); }
    let endBadges = '';
    for (const lid in net.lines) {
      const tp = M.lineTopo(net, lid);
      if (!tp.leaves) continue;
      for (const sid of tp.leaves) {
        const i = lay.st.indexOf(sid); if (i < 0) continue;
        const jj = lay.st.indexOf(tp.adj.get(sid)[0].other); if (jj < 0) continue;
        const dx = px(i) - px(jj), dy = py(i) - py(jj), l = Math.hypot(dx, dy) || 1;
        const L = net.lines[lid], txt = M.lineBadge(L);
        measure.font = '800 14px ' + font;
        const w = Math.max(28, Math.ceil(measure.measureText(txt).width) + 12), dirs = [[dx / l, dy / l], [-dy / l, dx / l], [dy / l, -dx / l], [0, -1], [0, 1], [1, 0], [-1, 0]];
        let best = null;
        for (const dist of [30, 48, 70, 96]) {
          for (const d of dirs) {
            const bx = px(i) + d[0] * (dist + w * Math.abs(d[0]) / 2), by = py(i) + d[1] * dist;
            const b = [bx - w / 2 - 2, by - 14, bx + w / 2 + 2, by + 14], ov = overlap(b);
            if (!best || ov < best.ov) best = { x: bx, y: by, b: b, ov: ov };
            if (!ov) break;
          }
          if (!best.ov) break;
        }
        index.add(best.b, 8); expand(best.b);
        endBadges += '<g data-line="' + lid + '" data-ax="' + px(i).toFixed(1) + '" data-ay="' + py(i).toFixed(1) + '"><rect x="' + (best.x - w / 2).toFixed(1) + '" y="' + (best.y - 12).toFixed(1) + '" width="' + w + '" height="24" rx="7" fill="' + AX.line(L) + '"/><text x="' + best.x.toFixed(1) + '" y="' + (best.y + 5).toFixed(1) + '" text-anchor="middle" class="nm-badge-t"' + (AX.enabled() ? ' style="fill:' + AX.ink(AX.line(L)) + '"' : '') + '>' + U.esc(txt) + '</text></g>';
      }
    }
    // 辅助模式在区间补少量编号，颜色重复或无法分辨时仍能识别线路；参与站名避让。
    if (AX.enabled()) {
      const badges = [], perLine = new Map();
      svg += '<g class="nm-line-ids">';
      for (const track of tracks) {
        const line = net.lines[track.seg.line], old = perLine.get(line.id) || [];
        if (badges.length >= 48 || old.length >= 3 || track.screen.length < 2) continue;
        const a = track.screen[0], b = track.screen[track.screen.length - 1];
        if (U.dist(a[0], a[1], b[0], b[1]) < 64) continue;
        for (const f of [0.5, 0.7, 0.3]) {
          const p = AX.pointOn(track.screen, f), text = AX.number(line), w = Math.max(22, text.length * 8 + 10);
          if (positions.some(function (q) { return U.dist(p[0], p[1], q[0], q[1]) < 32; }) || old.some(function (q) { return U.dist(p[0], p[1], q[0], q[1]) < 190; })) continue;
          const box = [p[0] - w / 2 - 3, p[1] - 12, p[0] + w / 2 + 3, p[1] + 12];
          if (badges.some(function (r) { return box[0] < r[2] && box[2] > r[0] && box[1] < r[3] && box[3] > r[1]; })) continue;
          svg += AX.svgBadge(line, p[0], p[1]); badges.push(box); old.push(p); perLine.set(line.id, old); index.add(box, 8); expand(box); break;
        }
      }
      svg += '</g>';
    }
    // 站名就近交错、长名分行；位置不足时扩展整张图，不用大量引线把名字拉走。
    const order = []; for (let i = 0; i < N; i++) order.push(i);
    order.sort(function (a, b) { return (linesOf[b].length + (walkSet.has(b) ? 1 : 0)) - (linesOf[a].length + (walkSet.has(a) ? 1 : 0)); });
    let lab = '', dots = '', needsRoom = false;
    const DIRS = [[0, -1], [0, 1], [1, 0], [-1, 0], [0.707, -0.707], [-0.707, -0.707], [0.707, 0.707], [-0.707, 0.707]];
    for (const i of order) {
      const s = net.stations[lay.st[i]], xfer = linesOf[i].length > 1, walk = walkSet.has(i), x = px(i), y = py(i);
      measure.font = (xfer || walk ? '700 ' : '500 ') + LABEL_SIZE + 'px ' + font;
      const rows = stationText(s.name, measure), lineHeight = LABEL_SIZE + 5;
      const tw = Math.ceil(Math.max.apply(null, rows.map(function (t) { return measure.measureText(t).width; }))) + 12, th = rows.length * lineHeight + 4, r = xfer || walk ? 18 : 14;
      const cands = [];
      if (lay.nb[i].length) { const a = lay.nb[i][0], vx = px(a) - x, vy = py(a) - y, l = Math.hypot(vx, vy) || 1; cands.push([-vy / l, vx / l], [vy / l, -vx / l]); }
      for (const d of DIRS) cands.push(d);
      let best = null;
      for (const dist of [r, r + 8, r + 18, r + 30, r + 44, r + 64, r + 90]) {
        for (const c of cands) {
          const cx = x + c[0] * dist, cy = y + c[1] * dist;
          const anchor = c[0] > 0.35 ? 'start' : (c[0] < -0.35 ? 'end' : 'middle');
          const bx0 = anchor === 'start' ? cx : (anchor === 'end' ? cx - tw : cx - tw / 2);
          const by0 = c[1] > 0.35 ? cy : (c[1] < -0.35 ? cy - th : cy - th / 2);
          const b = [bx0, by0, bx0 + tw, by0 + th], ov = overlap(b);
          if (!best || ov < best.ov) best = { b: b, ov: ov, dist: dist };
          if (!ov) break;
        }
        if (!best.ov) break;
      }
      index.add(best.b, 8); expand(best.b);
      if (best.ov || best.dist > r + 18) needsRoom = true;
      const tx = (best.b[0] + 6).toFixed(1), ty = best.b[1] + LABEL_SIZE + 2;
      lab += '<text data-st="' + s.id + '" data-b="' + best.b[0].toFixed(1) + ' ' + best.b[1].toFixed(1) + ' ' + (best.b[2] - best.b[0]).toFixed(1) + ' ' + (best.b[3] - best.b[1]).toFixed(1) + '" data-ax="' + x.toFixed(1) + '" data-ay="' + y.toFixed(1) + '"' + (leaves.has(s.id) ? ' data-end="1"' : '') + ' x="' + tx + '" y="' + ty.toFixed(1) + '" class="nm-label' + (xfer || walk ? ' x' : '') + '" data-lines="' + linesOf[i].join(' ') + '">' + rows.map(function (text, k) { return '<tspan x="' + tx + '" y="' + (ty + k * lineHeight).toFixed(1) + '">' + U.esc(text) + '</tspan>'; }).join('') + '</text>';
      const tip = s.name + (xfer ? '（站内换乘：' + linesOf[i].map(function (l) { return net.lines[l].name; }).join('、') + '）' : '') + (walk ? '（可步行换乘）' : '') + ' · ' + (s.lv ? M.levelsText(M.stationLevels(net, s.id)) + '（天地换乘）' : TYPE_NAME[s.type] + '站') + ' · 点击在地图上定位';
      dots += stationMark(s, x, y, linesOf[i], net, xfer || walk, tip, stationAnchors.get(s.id), s.lv ? M.stationLevels(net, s.id) : null);
    }
    if (needsRoom && attempt < 3) return build(g, spacing * 1.3, attempt + 1);
    svg += '<g class="nm-dots">' + dots + '</g><g class="nm-badges">' + endBadges + '</g><g class="nm-labels">' + lab + '</g></svg>';
    // 留足全部站名与终点编号的边距；改变画幅而不移动任何地形、轨道或站标。
    const fullW = Math.ceil(extent[2] - extent[0]), fullH = Math.ceil(extent[3] - extent[1]);
    svg = svg.replace(/viewBox="[^"]*"/, 'viewBox="' + extent[0] + ' ' + extent[1] + ' ' + fullW + ' ' + fullH + '"');
    // 地形画在最下层；在车站与站名都放好之后再放水系名称（避让它们）
    if (geographic && showTerrain) {
      lay.vw = W; lay.vh = H;
      const t = terrainSVG(net, lay, base, boxes);
      const at = svg.indexOf('>') + 1; svg = svg.slice(0, at) + t + svg.slice(at);
    }
    const wrap = h('div', { class: 'nm-canvas', html: svg });
    wrap.querySelectorAll('.nm-lines > g').forEach(function (node, i) { node.dataset.order = i; });
    view = { x: extent[0], y: extent[1], w: fullW, h: fullH, W: fullW, H: fullH, fullX: extent[0], fullY: extent[1], cx: positions.reduce(function (sum, p) { return sum + p[0]; }, 0) / N, cy: positions.reduce(function (sum, p) { return sum + p[1]; }, 0) / N };
    return wrap;
  }

  function applyFocus() {
    if (!root) return;
    const svg = root.querySelector('.nm-svg'); if (!svg) return;
    svg.classList.toggle('focusing', !!focus);
    const lineLayer = svg.querySelector('.nm-lines');
    if (lineLayer) {
      const groups = Array.from(lineLayer.children).sort(function (a, b) { return Number(a.dataset.order) - Number(b.dataset.order); });
      for (const group of groups) lineLayer.appendChild(group);
      if (focus) for (const group of groups) if (group.dataset.line === focus) lineLayer.appendChild(group);
    }
    svg.querySelectorAll('[data-line]').forEach(function (el) { el.classList.toggle('on', el.getAttribute('data-line') === focus); });
    svg.querySelectorAll('[data-lines]').forEach(function (el) { el.classList.toggle('on', !!focus && el.getAttribute('data-lines').split(' ').indexOf(focus) >= 0); });
    root.querySelectorAll('.nm-chip').forEach(function (el) { el.classList.toggle('on', el.getAttribute('data-id') === focus); });
  }
  // 缩小视野时，站名和线路编号按缩放反向放大，在屏幕上保持能读的大小；放不下的普通站名先隐藏，换乘站与终点站优先。放大到原始比例后恢复全部站名
  let fitK = 0, fitSvg = null;
  const SCALED = '.nm-label, .nm-badges g, .nm-wlabel, .nm-dots > *';
  const MARK_R = { x: 12.1, st: 6.5 };   // 换乘站、普通站标志的半径（含描边）
  function fitLabels(svg) {
    const r = svg.getBoundingClientRect(); if (!r.width || !r.height) return;
    const scale = Math.min(r.width / view.w, r.height / view.h), mobile = innerWidth <= 760, k = Math.max(1, (mobile ? 12 : 13) / (LABEL_SIZE * scale)), kb = Math.max(1, (mobile ? 16 : 18) / (24 * scale));
    if (fitSvg === svg && Math.abs(k - fitK) / Math.max(fitK, 1e-6) < 0.04 && !(k === 1 && fitK !== 1)) return;
    fitSvg = svg; fitK = k;
    const placed = [], cell = 160, grid = new Map();
    const keys = function (b, visit) { for (let i = Math.floor(b[0] / cell); i <= Math.floor(b[2] / cell); i++) for (let j = Math.floor(b[1] / cell); j <= Math.floor(b[3] / cell); j++) visit(i + ':' + j); };
    const hit = function (b) { let on = false; keys(b, function (key) { for (const q of grid.get(key) || []) if (b[0] < q[2] && b[2] > q[0] && b[1] < q[3] && b[3] > q[1]) on = true; }); return on; };
    const place = function (b) { keys(b, function (key) { let list = grid.get(key); if (!list) { list = []; grid.set(key, list); } list.push(b); }); };
    const scaleEl = function (el, f, ox, oy) { if (f > 1.001) el.setAttribute('transform', 'translate(' + ox.toFixed(1) + ' ' + oy.toFixed(1) + ') scale(' + f.toFixed(3) + ') translate(' + (-ox).toFixed(1) + ' ' + (-oy).toFixed(1) + ')'); else el.removeAttribute('transform'); };
    const box = function (el) {
      if (!el._nmBox) {
        const v = el.dataset.b;
        if (v) { const q = v.split(' '); el._nmBox = { x: +q[0], y: +q[1], w: +q[2], h: +q[3] }; }
        else { const b = el.getBBox(); el._nmBox = { x: b.x, y: b.y, w: b.width, h: b.height }; }
      }
      return el._nmBox;
    };
    for (const el of svg.querySelectorAll('.nm-badges g')) { const b = box(el), ox = +el.dataset.ax, oy = +el.dataset.ay; scaleEl(el, kb, ox, oy); place([ox + (b.x - ox) * kb, oy + (b.y - oy) * kb, ox + (b.x + b.w - ox) * kb, oy + (b.y + b.h - oy) * kb]); }
    for (const el of svg.querySelectorAll('.nm-wlabel')) { const b = box(el); scaleEl(el, k, b.x + b.w / 2, b.y + b.h / 2); }
    // 站点标志同样保持能看清的大小（换乘站半径约 6.6 px，普通站同比例）。胶囊是粗描边画的，外框量不出真实大小，所以按固定半径计算；
    // 放大后被换乘站盖住的普通站先隐藏，不露出半个圆圈
    const km = Math.max(1, 6.6 / (MARK_R.x * scale)), marks = Array.from(svg.querySelectorAll('.nm-dots > *')), hubs = [];
    const reach0 = (MARK_R.x + MARK_R.st) * km * 0.85, hubGrid = new Map(), hubKey = function (i, j) { return i * 65536 + j; };
    for (const el of marks) if (el.classList.contains('nm-x')) {
      let cx, cy;
      if (el.dataset.c) { const q = el.dataset.c.split(' '); cx = +q[0]; cy = +q[1]; } else { const b = box(el); cx = b.x + b.w / 2; cy = b.y + b.h / 2; }
      scaleEl(el, km, cx, cy); hubs.push([cx, cy]);
      const key = hubKey(Math.floor(cx / reach0), Math.floor(cy / reach0)); let l = hubGrid.get(key); if (!l) hubGrid.set(key, l = []); l.push([cx, cy]);
    }
    const nearHub = function (cx, cy) {
      const ci = Math.floor(cx / reach0), cj = Math.floor(cy / reach0);
      for (let i = ci - 1; i <= ci + 1; i++) for (let j = cj - 1; j <= cj + 1; j++) { const l = hubGrid.get(hubKey(i, j)); if (l) for (const p of l) if (Math.hypot(p[0] - cx, p[1] - cy) < reach0) return true; }
      return false;
    };
    const hidden = new Set();
    for (const el of marks) {
      if (el.classList.contains('nm-x')) continue;
      const cx = +el.getAttribute('cx'), cy = +el.getAttribute('cy');
      const cover = km > 1 && nearHub(cx, cy);
      el.style.display = cover ? 'none' : '';
      if (cover) hidden.add(el.getAttribute('data-st')); else scaleEl(el, km, cx, cy);
    }
    // 先摆换乘站和终点站，再摆普通站；文字从靠近车站的一边向外放大
    const labels = Array.from(svg.querySelectorAll('.nm-label')), rank = function (el) { return el.classList.contains('x') || el.dataset.end ? 0 : 1; };
    labels.sort(function (a, b) { return rank(a) - rank(b); });
    for (const el of labels) {
      const b = box(el), ox = U.clamp(+el.dataset.ax, b.x, b.x + b.w), oy = U.clamp(+el.dataset.ay, b.y, b.y + b.h);
      const q = [ox + (b.x - ox) * k, oy + (b.y - oy) * k, ox + (b.x + b.w - ox) * k, oy + (b.y + b.h - oy) * k];
      const show = k === 1 || (!hit(q) && !hidden.has(el.getAttribute('data-st')));
      el.style.display = show ? '' : 'none';
      if (show) { scaleEl(el, k, ox, oy); place(q); }
    }
  }
  function setView() {
    const svg = root && root.querySelector('.nm-svg'); if (!svg || !view) return;
    svg.setAttribute('viewBox', view.x.toFixed(1) + ' ' + view.y.toFixed(1) + ' ' + view.w.toFixed(1) + ' ' + view.h.toFixed(1));
    fitLabels(svg);
  }
  // 平滑缩放：滚轮与按钮只改变目标视野，逐帧缓动过去（与地图的缩放手感一致），光标下的位置保持不动
  let tgt = null, raf = 0, lastT = 0;
  function tween(t) {
    raf = 0; if (!tgt || !view) { tgt = null; return; }
    const dt = Math.min(0.05, Math.max(0.001, ((t || performance.now()) - (lastT || t || 0)) / 1000)); lastT = t;
    const k = 1 - Math.exp(-dt * 14);
    view.x += (tgt.x - view.x) * k; view.y += (tgt.y - view.y) * k; view.w += (tgt.w - view.w) * k; view.h += (tgt.h - view.h) * k;
    const eps = view.w * 0.0015;
    if (Math.abs(tgt.w - view.w) < eps && Math.abs(tgt.h - view.h) < eps && Math.abs(tgt.x - view.x) < eps && Math.abs(tgt.y - view.y) < eps) { Object.assign(view, tgt); tgt = null; }
    setView();
    if (tgt) raf = requestAnimationFrame(tween); else lastT = 0;
  }
  function animateTo(v) { tgt = v; if (!raf) { lastT = performance.now(); raf = requestAnimationFrame(tween); } }
  function zoomAt(f, clientX, clientY) {
    const svg = root && root.querySelector('.nm-svg'); if (!svg || !view) return;
    const r = svg.getBoundingClientRect(), base = tgt || view;
    if (clientX == null) { clientX = r.left + r.width / 2; clientY = r.top + r.height / 2; }
    const s = Math.max(base.w / r.width, base.h / r.height);
    const ox = (r.width - base.w / s) / 2, oy = (r.height - base.h / s) / 2;
    const mx = base.x + (clientX - r.left - ox) * s, my = base.y + (clientY - r.top - oy) * s;
    const nw = U.clamp(base.w * f, Math.min(view.W, view.readW || view.W) * 0.08, Math.max(view.W, view.readW || view.W) * 2), k = nw / base.w;
    animateTo({ x: mx - (mx - base.x) * k, y: my - (my - base.y) * k, w: nw, h: base.h * k });
  }
  function fitView() { if (view) animateTo({ x: view.fullX, y: view.fullY, w: view.W, h: view.H }); }
  function readableView(canvas) {
    if (!view || !canvas.clientWidth || !canvas.clientHeight) return;
    const w = canvas.clientWidth, hh = canvas.clientHeight, fit = Math.min(w / view.W, hh / view.H);
    const scale = U.clamp(fit, (innerWidth <= 760 ? 13 : 14) / LABEL_SIZE, 1);
    if (Math.abs(scale - fit) < 0.001) { view.readW = view.w; return; }
    view.w = w / scale; view.h = hh / scale;
    const center = function (c, size, start, full) { return size < full ? U.clamp(c - size / 2, start, start + full - size) : start + (full - size) / 2; };
    view.x = center(view.cx, view.w, view.fullX, view.W); view.y = center(view.cy, view.h, view.fullY, view.H);
    view.readW = view.w;
    setView();
  }
  function bindPanZoom(canvas) {
    const svg = canvas.querySelector('.nm-svg'); if (!svg) return;
    canvas.addEventListener('wheel', function (e) {
      e.preventDefault();
      const d = e.deltaMode === 1 ? e.deltaY * 33 : e.deltaY;
      zoomAt(Math.exp(U.clamp(d, -240, 240) * 0.0022), e.clientX, e.clientY);
    }, { passive: false });
    let drag = null, pinch = null;
    const pts = new Map();   // 触屏：两指缩放
    const two = function () { const p = Array.from(pts.values()); return { d: Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y) || 1, x: (p[0].x + p[1].x) / 2, y: (p[0].y + p[1].y) / 2 }; };
    canvas.addEventListener('pointerdown', function (e) {
      if (tgt) { tgt = null; }
      if (e.pointerType === 'touch') { pts.set(e.pointerId, { x: e.clientX, y: e.clientY }); if (pts.size === 2) { pinch = two(); drag = null; return; } }
      drag = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y, moved: false }; canvas.setPointerCapture(e.pointerId);
    });
    const lift = function (e) { pts.delete(e.pointerId); if (pts.size < 2) pinch = null; };
    canvas.addEventListener('pointercancel', function (e) { lift(e); drag = null; canvas.classList.remove('grabbing'); });
    canvas.addEventListener('pointermove', function (e) {
      if (pts.has(e.pointerId)) pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pinch && pts.size >= 2) {
        const t = two(), r = svg.getBoundingClientRect(), s = Math.max(view.w / r.width, view.h / r.height);
        view.x -= (t.x - pinch.x) * s; view.y -= (t.y - pinch.y) * s; setView();
        zoomAt(pinch.d / t.d, t.x, t.y);
        pinch = t; return;
      }
      if (!drag) return;
      const r = svg.getBoundingClientRect(), s = Math.max(view.w / r.width, view.h / r.height);
      if (Math.hypot(e.clientX - drag.x, e.clientY - drag.y) > 4) drag.moved = true;
      if (drag.moved) { view.x = drag.vx - (e.clientX - drag.x) * s; view.y = drag.vy - (e.clientY - drag.y) * s; setView(); canvas.classList.add('grabbing'); }
    });
    canvas.addEventListener('pointerup', function (e) {
      const wasPinch = !!pinch || pts.size > 1; lift(e);
      if (wasPinch) { drag = null; return; }
      const d = drag; drag = null; canvas.classList.remove('grabbing');
      if (!d || d.moved) return;
      const t = document.elementFromPoint(e.clientX, e.clientY);
      const el = t && t.closest ? t.closest('[data-st]') : null;
      if (el) locate(el.getAttribute('data-st'));
    });
  }
  function locate(sid) {
    const g = game(); if (!g) return;
    const net = useDraft && g.draft ? g.draft.net : g.net, s = net.stations[sid];
    if (!s) return;
    NetMap.close();
    ui.select({ kind: 'station', id: sid });
    ui.flyTo(s.x, s.y, Math.max(ui.R.cam.zoom, 24));
  }
  // 图例：线型与换乘标示
  function legend() {
    const sw = function (type) { return '<svg width="34" height="10" viewBox="0 0 34 10"><path d="M3 5H31" stroke="var(--accent)" stroke-width="' + (type === 'elevated' ? 7 : 5.5) + '" stroke-linecap="round"/>' + (type === 'elevated' ? '<path d="M3 5H31" class="nm-elev"/>' : (type === 'surface' ? '<path d="M3 5H31" class="nm-surf"/>' : '')) + '</svg>'; };
    return h('div', { class: 'nm-legend' },
      h('span', { html: sw('underground') }), '地下', h('span', { html: sw('elevated') }), '高架', h('span', { html: sw('surface') }), '地面',
      h('span', { class: 'nm-lg-gap' }),
      h('span', { html: '<svg width="32" height="30" viewBox="-16 -15 32 30">' + lgMark('换乘站') + '</svg>' }), '换乘站',
      h('span', { html: '<svg width="64" height="30" viewBox="-16 -15 64 30"><path d="M0 0H32" class="nm-walk-p"/>' + lgMark('换乘站') + '<g transform="translate(32 0)">' + lgMark('换乘站') + '</g></svg>' }), '站外步行换乘',
      h('span', { html: '<svg width="38" height="32" viewBox="-16 -17 38 32">' + lgMark('天地换乘', ['underground', 'elevated']) + '</svg>' }), '天地换乘');
  }
  // 图例里的换乘站标志（两条线路）与天地换乘站（地下 + 高架）
  const LG_NET = { lines: { a: { color: '#f3d03e' }, b: { color: '#00629b' } } };
  const lgMark = function (tip, levels) { return stationMark({ id: '' }, 0, 0, ['a', 'b'], LG_NET, true, tip, null, levels || null).replace(/ data-st="[^"]*" data-lines="[^"]*"/, ''); };

  // 各线路长度与线路总长（km，按编译后的轨道几何；共线区段按各线分别计，与里程碑的线网总长口径一致）
  function lineKm(g) {
    const C = useDraft && g.draft ? g.draftCompiled() : g.compiled, m = new Map(); m.total = 0;
    if (C && C.segs) C.segs.forEach(function (cs) { if (!cs.g) return; const k = cs.g.lenM / 1000; m.set(cs.seg.line, (m.get(cs.seg.line) || 0) + k); m.total += k; });
    return m;
  }
  const kmText = function (v) { return (v || 0).toFixed(1) + ' km'; };

  // ---------------- 导出 PNG：完整网络（不受当前缩放与聚焦影响）+ 标题、日期与线路图例 ----------------
  function exportBase(font) {
    return 'text{font-family:' + font + '}.nm-elev{fill:none;stroke:#fff;stroke-width:2.2}.nm-surf{fill:none;stroke:rgba(255,255,255,.95);stroke-width:3;stroke-dasharray:2 5;stroke-linecap:butt}' +
      '.nm-walk path{fill:none;stroke:#25334a;stroke-width:2;stroke-dasharray:2 4;stroke-linecap:round;opacity:.55}.nm-st{fill:#fff;stroke-width:3.2}.nm-casing{stroke:#fff}' +
      '.nm-xo{fill:none;stroke:#25334a;stroke-linecap:round}.nm-xf{fill:none;stroke:#fff;stroke-linecap:round}.nm-xg{fill:none;stroke:#25334a;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round}' +
      '.nm-label{font-size:' + LABEL_SIZE + 'px;font-weight:500;fill:#1f2a3a;paint-order:stroke;stroke:#fff;stroke-width:4px;stroke-linejoin:round}.nm-label.x{font-weight:700}.nm-badge-t{font-size:14px;font-weight:800;fill:#fff}' +
      '.nm-water{fill:#dcecf8;stroke:none}.nm-river path{stroke:#dcecf8}.nm-river .nm-river-area{fill:#dcecf8;stroke:none}.nm-green{fill:#e6f2e2;opacity:.65}.nm-terrain.simple .nm-green{opacity:.4}.nm-wlabel{font-size:12.5px;font-style:italic;letter-spacing:2px;fill:#6f9cc4}';
  }
  let exporting = false;
  function setExporting(on) {
    exporting = on;
    const b = root && root.querySelector('.nm-export'); if (!b) return;
    b.disabled = on; b.lastChild.textContent = on ? '正在导出…' : '导出 PNG';
  }
  function exportPNG() {
    const g = game(), svg = root && root.querySelector('.nm-svg');
    if (!g || !svg || !view || exporting) return;
    setExporting(true);
    const fail = function (msg) { setExporting(false); ui.toast('导出失败：' + msg, 'bad'); };
    const net = useDraft && g.draft ? g.draft.net : g.net, D = CM.DATA, isGeo = geographic;
    const font = getComputedStyle(document.body).fontFamily || 'sans-serif';
    const W = view.W, H = view.H;
    const clone = svg.cloneNode(true);
    clone.setAttribute('viewBox', view.fullX + ' ' + view.fullY + ' ' + W + ' ' + H);
    clone.setAttribute('width', W.toFixed(0)); clone.setAttribute('height', H.toFixed(0));
    clone.classList.remove('focusing');
    clone.querySelectorAll(SCALED).forEach(function (el) { el.removeAttribute('transform'); el.style.display = ''; });
    clone.querySelectorAll('.on').forEach(function (el) { el.classList.remove('on'); });
    const layer = clone.querySelector('.nm-lines');
    if (layer) Array.from(layer.children).sort(function (a, b) { return Number(a.dataset.order) - Number(b.dataset.order); }).forEach(function (node) { layer.appendChild(node); });
    const st = document.createElementNS('http://www.w3.org/2000/svg', 'style'); st.textContent = exportBase(font);
    clone.insertBefore(st, clone.firstChild);
    const img = new Image();
    img.onload = function () { try {
      const sc = Math.min(2, 7000 / Math.max(W, H)), M0 = 48 * sc;
      const lines = M.sortIds(Object.keys(net.lines)).map(function (lid) { return { id: lid, L: net.lines[lid], tp: M.lineTopo(net, lid) }; }).filter(function (o) { return o.tp.topo !== 'empty'; });
      const cw = Math.max(W * sc + 2 * M0, 960 * sc), cols = Math.max(1, Math.floor((cw - 2 * M0) / (220 * sc)));
      const headH = 108 * sc, footH = (Math.ceil(lines.length / cols) * 34 + 92) * sc;
      const ch = headH + H * sc + footH;
      const cv = document.createElement('canvas'); cv.width = Math.round(cw); cv.height = Math.round(ch);
      const c = cv.getContext('2d');
      const INK = '#1f2a3a';
      c.fillStyle = '#ffffff'; c.fillRect(0, 0, cw, ch);
      c.fillStyle = INK; c.textBaseline = 'alphabetic';
      c.font = '800 ' + (30 * sc) + 'px ' + font; c.fillText((D.city || '') + (isGeo ? '地铁地理线网图' : '地铁线路示意图'), M0, 56 * sc);
      c.font = (15 * sc) + 'px ' + font; c.fillStyle = '#5d6b80';
      let nSt = 0; for (const id in net.stations) if (M.stationLines(net, id).length) nSt++;
      const KM = lineKm(g);
      c.fillText('游戏时间 ' + g.clock.y + ' 年 ' + g.clock.m + ' 月' + (useDraft ? '（含建设草案）' : '') + ' · ' + lines.length + ' 条线路 · ' + nSt + ' 座车站 · 线路总长 ' + kmText(KM.total) + ' · 《城市与地铁》', M0, 84 * sc);
      c.drawImage(img, (cw - W * sc) / 2, headH, W * sc, H * sc);
      // 线路图例
      let y = headH + H * sc + 18 * sc;
      c.strokeStyle = '#e3e8ef'; c.lineWidth = 1 * sc; c.beginPath(); c.moveTo(M0, y); c.lineTo(cw - M0, y); c.stroke();
      y += 30 * sc;
      lines.forEach(function (o, k) {
        const x = M0 + (k % cols) * 220 * sc, yy = y + Math.floor(k / cols) * 34 * sc;
        c.fillStyle = AX.line(o.L); c.beginPath(); c.roundRect ? c.roundRect(x, yy - 14 * sc, 30 * sc, 20 * sc, 6 * sc) : c.rect(x, yy - 14 * sc, 30 * sc, 20 * sc); c.fill();
        c.fillStyle = AX.ink(AX.line(o.L)); c.font = '800 ' + (12 * sc) + 'px ' + font; c.textAlign = 'center'; c.fillText(M.lineBadge(o.L), x + 15 * sc, yy + 1 * sc);
        c.textAlign = 'left'; c.fillStyle = INK; c.font = '600 ' + (14 * sc) + 'px ' + font; c.fillText(o.L.name, x + 40 * sc, yy);
        const nw = c.measureText(o.L.name).width;
        c.fillStyle = '#7a8799'; c.font = (12 * sc) + 'px ' + font; c.fillText(o.tp.stations.length + ' 站 · ' + kmText(KM.get(o.id)), x + 48 * sc + nw, yy);
      });
      c.fillStyle = '#9aa5b5'; c.font = (12 * sc) + 'px ' + font; c.textAlign = 'right';
      c.fillText('线型：实线为地下，带白色中线为高架，带白色枕木纹为地面；⇄ 圆环为换乘站，虚线相连为站外步行换乘', cw - M0, ch - 38 * sc);
      c.fillText(isGeo ? '按游戏地图中的实际站点、轨道与地形等比例绘制；共线区间以同心色带区分，站外虚线只表示换乘联系。' : '站点按实际位置统一等比例缩放；同向线路并排，线形为简化示意，不显示地形。', cw - M0, ch - 20 * sc);
      c.textAlign = 'left';
      cv.toBlob(function (blob) {
        if (!blob) { fail('无法生成图片'); return; }
        const filename = (isGeo ? '地铁地理线网图-' : '地铁线路示意图-') + (D.city || '城市') + '-' + g.clock.y + '年' + g.clock.m + '月.png';
        ui.toast('图片已生成，请在保存窗口中选择位置', 'info');
        const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=filename;
        document.body.appendChild(a); a.click();
        setTimeout(function(){URL.revokeObjectURL(a.href);a.remove();},1500);
        ui.toast('已导出线路示意图（'+cv.width+'×'+cv.height+' PNG）','good');setExporting(false);
      }, 'image/png');
    } catch (err) { console.error(err); fail('无法绘制示意图'); } };
    img.onerror = function () { fail('无法绘制示意图'); };
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(new XMLSerializer().serializeToString(clone));
  }

  let fresh = true;
  // 线路图只读线网：整个绘制期间共用区段与线路索引（v2.6），几百条线时不必每次遍历全网
  function render(keepView) {
    const g = game(); if (!g || !root) return;
    M.withSegIndex([g.net, g.draft && g.draft.net], function () { renderNow(keepView); });
  }
  function renderNow(keepView) {
    const g = game(); if (!g || !root) return;
    const savedView = keepView && view ? Object.assign({}, view) : null;
    const hasDraft = !!(g.draft && g.draftEval() && g.draftEval().changed);
    if (!hasDraft) useDraft = false;
    const net = useDraft && g.draft ? g.draft.net : g.net;
    root.innerHTML = '';
    const chips = h('div', { class: 'nm-chips' }), KM = lineKm(g);
    for (const lid of M.sortIds(Object.keys(net.lines))) {
      const L = net.lines[lid], tp = M.lineTopo(net, lid);
      if (tp.topo === 'empty') continue;
      chips.appendChild(h('button', { class: 'nm-chip', 'data-id': lid, 'data-silent': '1', onclick: function () { focus = focus === lid ? null : lid; applyFocus(); } }, h('span', { class: 'swatch', style: { background: AX.line(L) } }), L.name, h('span', { class: 'tiny muted' }, M.TOPO_NAME[tp.topo] + ' · ' + tp.stations.length + ' 站 · ' + kmText(KM.get(lid)))));
    }
    const nLines = chips.childNodes.length, nStations = Object.keys(net.stations).filter(function (sid) { return M.stationLines(net, sid).length; }).length;
    const head = h('div', { class: 'stats-head' }, h('span', { class: 'badge b-blue' }, CM.icon('network')),
      h('div', { class: 'nm-heading' }, h('h2', null, (CM.DATA.city || '') + '地铁线网'), h('div', { class: 'tiny muted' }, g.clock.y + ' 年 ' + g.clock.m + ' 月 · ' + nLines + ' 条线路 · ' + nStations + ' 座车站 · 线路总长 ' + kmText(KM.total))),
      h('div', { class: 'seg-ctl sm nm-mode', 'aria-label': '线路图布局' }, [[true, '地理线网'], [false, '简洁示意']].map(function (o) { return h('button', { class: geographic === o[0] ? 'on' : '', 'aria-pressed': geographic === o[0] ? 'true' : 'false', 'data-silent': '1', onclick: function () { if (geographic !== o[0]) { geographic = o[0]; CM.Sound && CM.Sound.play('soft'); render(); } } }, o[1]); })),
      hasDraft ? h('div', { class: 'seg-ctl sm' }, [[false, '正式网络'], [true, '含草案']].map(function (o) { return h('button', { class: useDraft === o[0] ? 'on' : '', 'data-silent': '1', onclick: function () { if (useDraft !== o[0]) { useDraft = o[0]; focus = null; render(); } } }, o[1]); })) : null,
      h('div', { class: 'grow' }),
      h('span', { class: 'tiny muted nm-hint' }, '滚轮缩放 · 拖动平移 · 点击车站定位'),
      h('div', { class: 'nm-tools' },
        h('button', { class: 'hbtn', 'data-tip': '放大', onclick: function () { zoomAt(0.7); } }, CM.icon('plus')),
        h('button', { class: 'hbtn', 'data-tip': '缩小', onclick: function () { zoomAt(1 / 0.7); } }, CM.icon('minus')),
        h('button', { class: 'hbtn', 'data-tip': '显示全部', onclick: fitView }, CM.icon('expand')),
        h('button', { class: 'hbtn' + (geographic && showTerrain ? ' on' : ''), disabled: !geographic, 'aria-label': '查看地形', 'data-tip': geographic ? (showTerrain ? '隐藏地形（江河、湖海与山林）' : '显示地形（江河、湖海与山林）') : '简洁示意不显示地形', 'data-silent': '1', onclick: function () { if (!geographic) return; showTerrain = !showTerrain; CM.Sound && CM.Sound.play('toggle'); render(true); } }, CM.icon('mountain'))),
      h('button', { class: 'btn sm nm-export', 'aria-label': '导出 PNG', 'data-tip': '导出完整线路示意图（含标题与线路图例）', disabled: exporting, onclick: exportPNG }, CM.icon('export'), exporting ? '正在导出…' : '导出 PNG'),
      h('button', { class: 'hbtn nm-close', 'data-tip': '关闭', 'data-key': 'Esc', onclick: function () { NetMap.close(); } }, CM.icon('close')));
    tgt = null;
    const canvas = build(g);
    if (!canvas.classList.contains('nm-canvas')) head.querySelectorAll('.nm-tools button, .btn').forEach(function (b) { b.disabled = true; });
    const bar = h('div', { class: 'nm-bar' }, chips.childNodes.length ? chips : null, legend(), h('span', { class: 'tiny muted' }, geographic ? '站线与地形等比例 · 可拖动浏览，或显示全图' : '站点位置等比例 · 线路走向示意 · 无地形'));
    const body = h('div', { class: 'nm-body' }, bar, canvas);
    // 只有打开时播放入场动画；打开后切换正式 / 含草案或网络变化时就地重绘，不闪动
    const win = h('div', { class: 'stats-win nm-win' + (fresh ? '' : ' static'), onclick: function (e) { e.stopPropagation(); } }, head, body);
    fresh = false;
    root.appendChild(win);
    if (savedView && view && savedView.W === view.W && savedView.H === view.H) { Object.assign(view, savedView); setView(); }
    else if (canvas.classList.contains('nm-canvas')) readableView(canvas);
    root.onclick = function () { NetMap.close(); };
    if (canvas.classList.contains('nm-canvas')) bindPanZoom(canvas);
    if (focus && !net.lines[focus]) focus = null;
    applyFocus();
  }

  let openJob = 0;
  const NetMap = {
    open: function (u) {
      ui = u;
      const g = game();
      if (g && g.id !== openedGameId) { openedGameId = g.id; focus = null; useDraft = false; }
      if (!root) { root = h('div', { id: 'netmap', class: 'hidden' }); document.getElementById('app').appendChild(root); }
      root.classList.remove('hidden');
      fresh = true;
      // 线路很多时排版要一会儿：先显示窗口与提示，画面刷新后再开始（v2.6）
      if (g && Object.keys(g.net.segments).length > 400) {
        root.innerHTML = '';
        root.appendChild(h('div', { class: 'stats-win nm-win static' }, h('div', { class: 'nm-empty' }, CM.icon('network', 40), h('div', null, '正在绘制线路图…'))));
        const job = ++openJob;
        requestAnimationFrame(function () { setTimeout(function () { if (job === openJob && NetMap.isOpen()) render(); }, 0); });
      } else render();
    },
    close: function () { tgt = null; if (root) { root.classList.add('hidden'); root.innerHTML = ''; } },
    exportPNG: function () { exportPNG(); },
    isOpen: function () { return !!root && !root.classList.contains('hidden'); },
    refresh: function (keepView) { if (NetMap.isOpen()) render(!!keepView); },
  };
  CM.NetMap = NetMap;
})(window.CM);
