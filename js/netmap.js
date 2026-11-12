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
    // 这一段和别的线实际相交：路线依次经过排版给出的交叉点，两条线在图上的相交位置与实际一致
    let via = base.via && base.via.get(s.a + '|' + s.b);
    if (!via && base.via) { const r = base.via.get(s.b + '|' + s.a); if (r) via = r.slice().reverse(); }
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
    if (via) {
      // 车站与交叉点之间的每一小段都严格走八方向：段很短，按 8 px 容差直连会斜得很明显，没对齐时先走 45° 再走直线
      const pts = [a].concat(via.map(function (p) { return [p[0] + base.ox, p[1] + base.oy]; }), [b]), raw = [a];
      for (let i = 1; i < pts.length; i++) {
        const p = pts[i - 1], q = pts[i], dx = q[0] - p[0], dy = q[1] - p[1], m = Math.min(Math.abs(dx), Math.abs(dy));
        if (Math.min(Math.abs(dx), Math.abs(dy), Math.abs(Math.abs(dx) - Math.abs(dy))) >= 1) raw.push([p[0] + Math.sign(dx) * m, p[1] + Math.sign(dy) * m]);
        raw.push(q);
      }
      inspect(raw, 14, false);
      return best;
    }
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

  // 简洁图的站位（v2.7）：交给 NetLayout，线路走八方向、站距基本均匀（见 netlayout.js）
  function straighten(net, lay, base, spacing) {
    const pos = CM.NetLayout.solve(lay, net, UNIT * 0.9 * spacing);
    base.via = pos.via || null; base.virt = pos.virt || null;   // 两条线实际相交的点（见 netlayout.js crossings）
    base.snap = new Map();
    for (const sid of lay.st) { const s = net.stations[sid]; base.snap.set(s.x + ',' + s.y, pos.get(sid)); }
  }

  // 地理线网中，地形、实际轨道和车站共用等比例投影；不移动岸线或省略小水面。
  // 打开线网图默认先看地理线网（v2.7 玩家反馈：它和实际走向一致），切到线路图后本次游戏内记住
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
    const labels = waterLabels(named, lay, boxes);
    const a = base(0, 0), b = base(CM.CFG.W, CM.CFG.H);
    const clip = '<rect x="' + f(a[0]) + '" y="' + f(a[1]) + '" width="' + f(b[0] - a[0]) + '" height="' + f(b[1] - a[1]) + '"/>';
    return '<defs><clipPath id="nmGeoClip">' + clip + '</clipPath></defs>' +
      '<g class="nm-terrain" clip-path="url(#nmGeoClip)" stroke-linejoin="round" stroke-linecap="round">' + green + water + '<g class="nm-river" fill="none">' + rivers + '</g>' + labels + '</g>';
  }
  // 水系名称：大的优先，最多 6 个，避开车站、线路和站名
  function waterLabels(named, lay, boxes) {
    let labels = ''; const seen = new Set();
    named.sort(function (a, b) { return b.size - a.size; });
    for (const item of named) {
      const q = item.q;
      if (seen.has(item.name) || seen.size >= 6 || q[0] < 0 || q[0] > lay.vw || q[1] < 0 || q[1] > lay.vh) continue;
      const tw = item.name.length * 13 + 6, box = [q[0] - tw / 2, q[1] - 9, q[0] + tw / 2, q[1] + 9];
      if (boxes.some(function (b) { return Math.min(box[2], b[2]) > Math.max(box[0], b[0]) && Math.min(box[3], b[3]) > Math.max(box[1], b[1]); })) continue;
      seen.add(item.name); boxes.push(box);
      labels += '<text x="' + q[0].toFixed(2) + '" y="' + (q[1] + 4.5).toFixed(2) + '" text-anchor="middle" class="nm-wlabel">' + U.esc(item.name) + '</text>';
    }
    return labels;
  }

  // ---------------- 线路图的江河湖海底图（v2.7） ----------------
  // 参照港铁路线图：线路图里车站挪了位置，水系跟着一起变形，线路过江、过海的位置与实际一致；底图不影响站位。
  // ① 水面轮廓：城市水域栅格里的湖海、江面和尚未填海的海域（不含按线画的河）按格算水面比例，描 0.5 等值线，
  //    得到互不重叠的整体轮廓（数据里的填海区是一条条细带，逐块画会变成梳齿，几块重叠的水面还会互相抠空）；
  //    太小的水塘、小岛不画，再在地理坐标里简化、切角、加密。按线画的河只取最长的十来条有名河流，画成水带。
  //    结果按城市、地形年份和站距缓存；回放各帧用同一组顶点、只是变形不同，可以逐点过渡。
  // ② 变形：车站（地理坐标 → 图上坐标）连成三角网，三角形内按仿射插值；网外每隔约三个站距铺一个格点，按附近车站的挪动量平移。
  //    两站之间的江面仍在两站之间，站周围的陆地仍在站周围，远处的水面跟着最近的车站一起挪。
  let wOutline = null, wShapes = null;
  function waterOutline(city) {
    const key = (CM.DATA.city || '') + '|' + city.W + 'x' + city.H + '|' + city.terrainYear;
    if (wOutline && wOutline.key === key) return wOutline;
    // 按水域栅格的原始精度（每格 4×4 个采样，约 62 m）描线：一两百米宽的江面（如巴黎塞纳河、东京隅田川）也是连续的一条，不会断成碎块被当成小水塘去掉
    const R = city.FS, sub = city.FS / R, W = city.W * R, H = city.H * R, FW = city.FW, wm = city.wmask, GW = W + 2, GH = H + 2, v = new Float32Array(GW * GH);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      let n = 0;
      for (let sy = 0; sy < sub; sy++) { const row = (y * sub + sy) * FW + x * sub; for (let sx = 0; sx < sub; sx++) { const id = wm[row + sx]; if (id && (id <= 30000 || id > 60000)) n++; } }
      v[(y + 1) * GW + x + 1] = n / (sub * sub);
    }
    // 等值线（marching squares）：格点 (i, j) 是第 (i-1, j-1) 个采样的中心，换回地图格坐标要除以 R；四周补一圈陆地，轮廓都是闭合的
    const T = 0.5, pts = new Map(), segs = [], at = new Map();
    const hp = function (i, j) { const k = (j * GW + i) * 2; if (!pts.has(k)) { const a = v[j * GW + i], b = v[j * GW + i + 1]; pts.set(k, [(i + (T - a) / (b - a) - 0.5) / R, (j - 0.5) / R]); } return k; };
    const vp = function (i, j) { const k = (j * GW + i) * 2 + 1; if (!pts.has(k)) { const a = v[j * GW + i], b = v[(j + 1) * GW + i]; pts.set(k, [(i - 0.5) / R, (j + (T - a) / (b - a) - 0.5) / R]); } return k; };
    const seg = function (k1, k2) { const s = segs.length >> 1; segs.push(k1, k2); for (const k of [k1, k2]) { const l = at.get(k); if (l) l.push(s); else at.set(k, [s]); } };
    for (let j = 0; j + 1 < GH; j++) for (let i = 0; i + 1 < GW; i++) {
      const va = v[j * GW + i], vb = v[j * GW + i + 1], vc = v[(j + 1) * GW + i + 1], vd = v[(j + 1) * GW + i];
      const idx = (va >= T ? 8 : 0) | (vb >= T ? 4 : 0) | (vc >= T ? 2 : 0) | (vd >= T ? 1 : 0);
      if (idx === 0 || idx === 15) continue;
      if (idx === 1 || idx === 14) seg(vp(i, j), hp(i, j + 1));
      else if (idx === 2 || idx === 13) seg(hp(i, j + 1), vp(i + 1, j));
      else if (idx === 3 || idx === 12) seg(vp(i, j), vp(i + 1, j));
      else if (idx === 4 || idx === 11) seg(hp(i, j), vp(i + 1, j));
      else if (idx === 6 || idx === 9) seg(hp(i, j), hp(i, j + 1));
      else if (idx === 7 || idx === 8) seg(hp(i, j), vp(i, j));
      else {   // 鞍点：按中心值决定哪两角相连
        const mid = (va + vb + vc + vd) / 4 >= T;
        if ((idx === 5) === mid) { seg(hp(i, j), vp(i, j)); seg(hp(i, j + 1), vp(i + 1, j)); } else { seg(hp(i, j), vp(i + 1, j)); seg(vp(i, j), hp(i, j + 1)); }
      }
    }
    const used = new Uint8Array(segs.length >> 1), rings = [];
    for (let s0 = 0; s0 < used.length; s0++) {
      if (used[s0]) continue;
      used[s0] = 1; const start = segs[2 * s0]; let cur = segs[2 * s0 + 1]; const ring = [pts.get(start)];
      while (cur !== start) {
        ring.push(pts.get(cur));
        let nx = -1; for (const s of at.get(cur)) if (!used[s]) { nx = s; break; }
        if (nx < 0) break;
        used[nx] = 1; cur = segs[2 * nx] === cur ? segs[2 * nx + 1] : segs[2 * nx];
      }
      if (ring.length >= 4) rings.push(ring);
    }
    wOutline = { key: key, rings: rings };
    return wOutline;
  }
  function waterShapes(city, med) {
    const O = waterOutline(city), key = O.key + '|' + med.toFixed(3);
    if (wShapes && wShapes.key === key) return wShapes;
    const Geo = CM.Geo, W = CM.CFG.W, H = CM.CFG.H, polys = [], rivers = [], named = [];
    const flat = function (pts) { const f = new Float64Array(pts.length * 2); for (let i = 0; i < pts.length; i++) { f[2 * i] = pts[i][0]; f[2 * i + 1] = pts[i][1]; } return f; };
    // 切角一遍（Chaikin）让轮廓圆润，再加密到约 0.2 个站距一个点：只有顶点跟着三角网变形，点太稀时两点之间的直边会切过岸边的线路。
    // 简化和切角都只在约 50 m 内改动岸线（tol）：沿岸的线路离水面常常只有几十米，改动大了水面会盖到线路和车站上
    const tol = Math.min(med * 0.15, 0.2);
    const smooth = function (pts, closed) {
      let out = pts;
      for (let it = 0; it < 1; it++) {
        const n = out.length, next = closed ? [] : [out[0]];
        for (let i = 0; i < (closed ? n : n - 1); i++) { const a = out[i], b = out[(i + 1) % n]; next.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25], [a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]); }
        if (!closed) next.push(out[n - 1]);
        out = next;
      }
      const step = med * 0.2, dense = [];
      for (let i = 0; i < out.length; i++) {
        const a = out[i], b = out[i + 1] || (closed ? out[0] : null); dense.push(a); if (!b) break;
        const n = Math.floor(Math.hypot(b[0] - a[0], b[1] - a[1]) / step);
        for (let k = 1; k <= n; k++) { const t = k / (n + 1); dense.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]); }
      }
      return dense;
    };
    // 水面：面积不到约两个站距见方、又不狭长的不画（小水塘、小岛）
    for (const ring of O.rings) {
      let s = 0, x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (let i = 0; i < ring.length; i++) { const a = ring[i], b = ring[(i + 1) % ring.length]; s += a[0] * b[1] - b[0] * a[1]; x0 = Math.min(x0, a[0]); x1 = Math.max(x1, a[0]); y0 = Math.min(y0, a[1]); y1 = Math.max(y1, a[1]); }
      if (Math.abs(s) / 2 < med * med * 2 && Math.max(x1 - x0, y1 - y0) < med * 2.5) continue;
      const simp = simplifyPoints(ring, tol, true); if (simp.length < 3) continue;
      polys.push(flat(smooth(simp, true)));
    }
    const inMap = function (b) { return b && b[2] >= 0 && b[0] <= W && b[3] >= 0 && b[1] <= H; };
    // 按线画的河：有名字的河、运河（细溪、排水沟不画）。同名的河在数据里常被切成好几段（如广州「珠江」穿过市中心的几段），
    // 按名字合计长度取最长的 12 条河，每条河的各段都画——江面窄到描不出来的河道（如二沙岛北侧的珠江）靠它显示。
    // 水带宽度按长度定，最长的约 10 px（如黄浦江），短的约 5 px，比线路（11 px）细，离河几十米的线路不会被水带盖住
    const lineLen = function (p) { let len = 0; for (let k = 2; k + 1 < p.length; k += 2) len += Math.hypot(p[k] - p[k - 2], p[k + 1] - p[k - 1]); return len; };
    const byName = new Map();
    for (const r of Geo.waterLines) {
      if (!r.name || r.w < 0.08 || !inMap(r.bbox)) continue;
      let o = byName.get(r.name); if (!o) byName.set(r.name, o = { name: r.name, len: 0, parts: [] });
      const len = lineLen(r.p); o.len += len; o.parts.push({ r: r, len: len });
    }
    const main = Array.from(byName.values()).filter(function (o) { return o.len >= med * 4; }).sort(function (a, b) { return b.len - a.len; }).slice(0, 12);
    const maxLen = main.length ? main[0].len : 1;
    for (const o of main) {
      const w = 5 + 5 * Math.sqrt(o.len / maxLen);
      for (const part of o.parts) {
        const src = []; for (let k = 0; k + 1 < part.r.p.length; k += 2) src.push([part.r.p[k], part.r.p[k + 1]]);
        const simp = simplifyPoints(src, tol, false); if (simp.length < 2) continue;
        rivers.push({ p: flat(smooth(simp, false)), w: w });
      }
      const top = o.parts.reduce(function (a, b) { return b.len > a.len ? b : a; }), k = Math.floor(top.r.p.length / 4) * 2;
      named.push({ name: o.name, x: top.r.p[k], y: top.r.p[k + 1], size: o.len * 0.5 });
    }
    for (const f of Geo.water) {
      if (!f.name || !inMap(f.bbox) || (f.bbox[2] - f.bbox[0]) * (f.bbox[3] - f.bbox[1]) < med * med * 4 || !f.rings.length) continue;
      const p = f.rings[0].p, k = Math.floor(p.length / 4) * 2; if (k + 1 < p.length) named.push({ name: f.name, x: p[k], y: p[k + 1], size: (f.bbox[2] - f.bbox[0]) * (f.bbox[3] - f.bbox[1]) });
    }
    // 地图边框（变形后裁掉框外：框外没有地理数据）
    const edge = [], st = Math.max(med, 2);
    for (let x = 0; x < W; x += st) edge.push([x, 0]);
    for (let y = 0; y < H; y += st) edge.push([W, y]);
    for (let x = W; x > 0; x -= st) edge.push([x, H]);
    for (let y = H; y > 0; y -= st) edge.push([0, y]);
    wShapes = { key: key, polys: polys, rivers: rivers, named: named, edge: flat(edge) };
    return wShapes;
  }
  // Delaunay 三角网（Bowyer–Watson，带邻接）：按蛇形顺序插点，从上一个三角形沿边走到插入点所在三角形，再向外找外接圆含该点的三角形，
  // 换成以插入点为顶点的扇形。几千个点也只要几十毫秒（回放每个版面都要算一次）。返回 [a, b, c, …]（同一转向）
  function delaunay(X, Y) {
    const n = X.length; if (n < 3) return [];
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (let i = 0; i < n; i++) { x0 = Math.min(x0, X[i]); x1 = Math.max(x1, X[i]); y0 = Math.min(y0, Y[i]); y1 = Math.max(y1, Y[i]); }
    const span = Math.max(x1 - x0, y1 - y0, 1), dd = span * 40, mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
    const PX = new Float64Array(n + 3), PY = new Float64Array(n + 3);
    PX.set(X); PY.set(Y); PX[n] = mx - dd; PY[n] = my - dd; PX[n + 1] = mx + dd; PY[n + 1] = my - dd; PX[n + 2] = mx; PY[n + 2] = my + dd;
    const V = [], Nb = [], CX = [], CY = [], R2 = [], st = [];   // st：0 有效，1 已删，2 本次插入要删
    const orient = function (a, b, c) { return (PX[b] - PX[a]) * (PY[c] - PY[a]) - (PY[b] - PY[a]) * (PX[c] - PX[a]); };
    const add = function (a, b, c) {
      const t = st.length; V.push(a, b, c); Nb.push(-1, -1, -1); st.push(0);
      const ax = PX[a], ay = PY[a], bx = PX[b], by = PY[b], cx = PX[c], cy = PY[c], d = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by));
      if (Math.abs(d) < 1e-12) { CX.push((ax + bx + cx) / 3); CY.push((ay + by + cy) / 3); R2.push(Infinity); return t; }
      const a2 = ax * ax + ay * ay, b2 = bx * bx + by * by, c2 = cx * cx + cy * cy, ux = (a2 * (by - cy) + b2 * (cy - ay) + c2 * (ay - by)) / d, uy = (a2 * (cx - bx) + b2 * (ax - cx) + c2 * (bx - ax)) / d;
      CX.push(ux); CY.push(uy); R2.push((ax - ux) * (ax - ux) + (ay - uy) * (ay - uy)); return t;
    };
    const inTri = function (t, i) { return orient(V[3 * t], V[3 * t + 1], i) >= 0 && orient(V[3 * t + 1], V[3 * t + 2], i) >= 0 && orient(V[3 * t + 2], V[3 * t], i) >= 0; };
    add(n, n + 1, n + 2);
    const rows = Math.max(1, Math.round(Math.sqrt(n) / 2)), ch = span / rows + 1e-9, order = [];
    for (let i = 0; i < n; i++) order.push(i);
    const row = function (i) { return Math.floor((Y[i] - y0) / ch); };
    order.sort(function (a, b) { const ra = row(a), rb = row(b); return ra - rb || (ra % 2 ? X[b] - X[a] : X[a] - X[b]); });
    let last = 0;
    for (const i of order) {
      const px = PX[i], py = PY[i];
      let t = last, steps = 0, limit = st.length + 50;
      for (;;) {
        if (++steps > limit) { t = -1; break; }
        let moved = false;
        for (let e = 0; e < 3; e++) { if (orient(V[3 * t + e], V[3 * t + (e + 1) % 3], i) < 0) { const nb = Nb[3 * t + e]; if (nb >= 0) { t = nb; moved = true; break; } } }
        if (!moved) break;
      }
      if (t < 0) { for (let k = 0; k < st.length; k++) if (!st[k] && inTri(k, i)) { t = k; break; } if (t < 0) continue; }
      const bad = [t], edges = []; st[t] = 2;
      for (let q = 0; q < bad.length; q++) {
        const u = bad[q];
        for (let e = 0; e < 3; e++) {
          const nb = Nb[3 * u + e];
          if (nb >= 0 && st[nb] === 2) continue;   // 两个要删的三角形之间的边
          if (nb >= 0 && st[nb] === 0) { const dx = px - CX[nb], dy = py - CY[nb]; if (dx * dx + dy * dy < R2[nb]) { st[nb] = 2; bad.push(nb); continue; } }
          edges.push(V[3 * u + e], V[3 * u + (e + 1) % 3], nb);
        }
      }
      for (const u of bad) st[u] = 1;
      const startAt = new Map(), made = [];
      for (let k = 0; k < edges.length; k += 3) {
        const a = edges[k], b = edges[k + 1], nb = edges[k + 2], nt = add(a, b, i);
        Nb[3 * nt] = nb;
        if (nb >= 0) for (let e = 0; e < 3; e++) if (V[3 * nb + e] === b && V[3 * nb + (e + 1) % 3] === a) { Nb[3 * nb + e] = nt; break; }
        startAt.set(a, nt); made.push(nt);
      }
      for (const nt of made) { const t2 = startAt.get(V[3 * nt + 1]); if (t2 !== undefined) { Nb[3 * nt + 1] = t2; Nb[3 * t2 + 2] = nt; } }
      if (made.length) last = made[made.length - 1];
    }
    const out = [];
    for (let t = 0; t < st.length; t++) if (!st[t] && V[3 * t] < n && V[3 * t + 1] < n && V[3 * t + 2] < n) out.push(V[3 * t], V[3 * t + 1], V[3 * t + 2]);
    return out;
  }
  // 变形函数：G、P 为车站的地理坐标、图上坐标（[x, y]，顺序一致）。
  // （试过把真实轨道和图上路线逐段对齐，水面会被线路拖着走，线路图把相邻两条线左右排反时反而把江面拖过另一条线，七城核对更差，没有采用）
  function waterWarp(G, P, med) {
    const N = G.length, W = CM.CFG.W, H = CM.CFG.H;
    let gx0 = 0, gy0 = 0, qx0 = 0, qy0 = 0, num = 0, den = 0;
    for (let i = 0; i < N; i++) { gx0 += G[i][0]; gy0 += G[i][1]; qx0 += P[i][0]; qy0 += P[i][1]; }
    gx0 /= N; gy0 /= N; qx0 /= N; qy0 /= N;
    for (let i = 0; i < N; i++) { const ax = G[i][0] - gx0, ay = G[i][1] - gy0; num += ax * (P[i][0] - qx0) + ay * (P[i][1] - qy0); den += ax * ax + ay * ay; }
    const sc = den > 1e-9 && num > 0 ? num / den : 1, tx = qx0 - sc * gx0, ty = qy0 - sc * gy0;
    const X = [], Y = [], TX = [], TY = [], L = Math.max(med * 3, Math.max(W, H) / 28), seen = new Map(), bk = function (x, y) { return Math.floor(x / L) * 100003 + Math.floor(y / L); };
    for (let i = 0; i < N; i++) {
      const k = bk(G[i][0], G[i][1]); let l = seen.get(k); if (!l) seen.set(k, l = []);
      if (l.some(function (j) { return Math.abs(X[j] - G[i][0]) < 1e-4 && Math.abs(Y[j] - G[i][1]) < 1e-4; })) continue;   // 重合的点只取一个
      l.push(X.length); X.push(G[i][0]); Y.push(G[i][1]); TX.push(P[i][0]); TY.push(P[i][1]);
    }
    const ns = X.length;
    // 网外格点：离控制点 1.5 个站距以外；挪动量按控制点挪动量加权平均（越近权重越大），格点略微错开，避免四点共圆
    let r = 12345; const rnd = function () { r = (r * 16807) % 2147483647; return r / 2147483647 - 0.5; };
    for (let y = -L; y <= H + L + 1e-6; y += L) for (let x = -L; x <= W + L + 1e-6; x += L) {
      const px = x + rnd() * L * 0.02, py = y + rnd() * L * 0.02;
      let close = false;
      for (let i = -1; i <= 1 && !close; i++) for (let j = -1; j <= 1 && !close; j++) { const l = seen.get(bk(px + i * L, py + j * L)); if (l) for (const s of l) if (Math.hypot(X[s] - px, Y[s] - py) < med * 1.5) { close = true; break; } }
      if (close) continue;
      let sw = 0, sx = 0, sy = 0;
      for (let s = 0; s < ns; s++) { const d2 = (X[s] - px) * (X[s] - px) + (Y[s] - py) * (Y[s] - py) + 1e-6, w = 1 / (d2 * d2); sw += w; sx += w * (TX[s] - (sc * X[s] + tx)); sy += w * (TY[s] - (sc * Y[s] + ty)); }
      X.push(px); Y.push(py); TX.push(sc * px + tx + sx / sw); TY.push(sc * py + ty + sy / sw);
    }
    // 三角形按外接框放进格子，变形时按格子找所在三角形
    const tri = delaunay(X, Y), cell = Math.max(med * 2, Math.max(W, H) / 50), grid = new Map(), gk = function (i, j) { return i * 100003 + j; };
    for (let k = 0; k < tri.length; k += 3) {
      const a = tri[k], b = tri[k + 1], c = tri[k + 2], ax = X[a], ay = Y[a], e1x = X[b] - ax, e1y = Y[b] - ay, e2x = X[c] - ax, e2y = Y[c] - ay, det = e1x * e2y - e1y * e2x;
      if (Math.abs(det) < 1e-9) continue;
      const o = { ax: ax, ay: ay, e1x: e1x, e1y: e1y, e2x: e2x, e2y: e2y, det: det, qa: [TX[a], TY[a]], q1: [TX[b] - TX[a], TY[b] - TY[a]], q2: [TX[c] - TX[a], TY[c] - TY[a]] };
      const bx0 = Math.floor(Math.min(ax, X[b], X[c]) / cell), bx1 = Math.floor(Math.max(ax, X[b], X[c]) / cell), by0 = Math.floor(Math.min(ay, Y[b], Y[c]) / cell), by1 = Math.floor(Math.max(ay, Y[b], Y[c]) / cell);
      for (let i = bx0; i <= bx1; i++) for (let j = by0; j <= by1; j++) { const key = gk(i, j); let l = grid.get(key); if (!l) grid.set(key, l = []); l.push(o); }
    }
    return function (x, y) {
      const l = grid.get(gk(Math.floor(x / cell), Math.floor(y / cell)));
      if (l) for (const o of l) {
        const dx = x - o.ax, dy = y - o.ay, u = (dx * o.e2y - dy * o.e2x) / o.det, w = (o.e1x * dy - o.e1y * dx) / o.det;
        if (u >= -1e-7 && w >= -1e-7 && u + w <= 1 + 1e-7) return [o.qa[0] + u * o.q1[0] + w * o.q2[0], o.qa[1] + u * o.q1[1] + w * o.q2[1]];
      }
      return [sc * x + tx, sc * y + ty];
    };
  }
  // 按站位变形后的水面（线路图使用）：polys / rivers / edge 为扁平坐标数组。G、P：车站的地理、图上坐标
  function waterLayer(city, G, P, med) {
    if (!CM.Geo || !CM.Geo.water || !city || !city.wmask || G.length < 2) return null;
    const S = waterShapes(city, med), warp = waterWarp(G, P, med);
    const map = function (f) { const o = new Float32Array(f.length); for (let k = 0; k + 1 < f.length; k += 2) { const q = warp(f[k], f[k + 1]); o[k] = q[0]; o[k + 1] = q[1]; } return o; };
    return { polys: S.polys.map(map), rivers: S.rivers.map(function (r) { return { p: map(r.p), w: r.w }; }), named: S.named.map(function (n) { return { name: n.name, q: warp(n.x, n.y), size: n.size }; }), edge: map(S.edge) };
  }
  // 线网的站距中位数（地理坐标）
  const medianSpacing = function (lens) { lens = lens.slice().sort(function (a, b) { return a - b; }); return Math.max(0.5, lens[lens.length >> 1] || 1); };
  function schematicWaterSVG(net, lay, base, boxes) {
    const G = [], P = [];
    for (const sid of lay.st) { const s = net.stations[sid]; G.push([s.x, s.y]); P.push(base(s.x, s.y)); }
    if (base.virt) for (const v of base.virt) { G.push(v.g); P.push([v.p[0] + base.ox, v.p[1] + base.oy]); }   // 两条线的交叉点也跟着排版走
    const L = waterLayer(game() && game().city, G, P, medianSpacing(lay.edges.map(function (e) { return e.geo; })));
    if (!L) return '';
    // 变形后在图上按 0.7 px 再简化一次，加密出来的点不全写进 SVG
    const d = function (f, closed) {
      const pts = []; for (let k = 0; k + 1 < f.length; k += 2) pts.push([f[k], f[k + 1]]);
      const q = pts.length > 8 ? simplifyPoints(pts, 0.7, closed) : pts;
      let s = ''; for (let k = 0; k < q.length; k++) s += (k ? 'L' : 'M') + q[k][0].toFixed(1) + ' ' + q[k][1].toFixed(1); return s + (closed ? 'Z' : '');
    };
    let water = ''; for (const p of L.polys) water += d(p, true);
    // 同一条河的各段（宽度相同、前后相连地放在一起）合成一个路径，伦敦这类有几百段运河的城市不至于生成几百个元素
    let rivers = '', run = '', rw = -1;
    for (const r of L.rivers) { if (r.w !== rw && run) { rivers += '<path d="' + run + '" stroke-width="' + rw.toFixed(1) + '"/>'; run = ''; } rw = r.w; run += d(r.p, false); }
    if (run) rivers += '<path d="' + run + '" stroke-width="' + rw.toFixed(1) + '"/>';
    return '<defs><clipPath id="nmSchClip"><path d="' + d(L.edge, true) + '"/></clipPath></defs>' +
      '<g class="nm-terrain schem" clip-path="url(#nmSchClip)" stroke-linejoin="round" stroke-linecap="round">' + (water ? '<path class="nm-water" fill-rule="evenodd" d="' + water + '"/>' : '') +
      '<g class="nm-river" fill="none">' + rivers + '</g>' + waterLabels(L.named, lay, boxes) + '</g>';
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
  // 换乘站和地图上一样：深色外环、白底、按线路分段的色环、中间换乘箭头（比例同 render.js）。并排车道时放大到盖住所有车道（v2.7）
  function plainHub(cx, cy, cols, r) {
    const f = function (v) { return v.toFixed(2); }, d = 'M' + f(cx) + ' ' + f(cy) + 'L' + f(cx) + ' ' + f(cy);
    return '<path class="nm-xo" d="' + d + '" stroke-width="' + f(2 * r * 1.15) + '"/><path class="nm-xf" d="' + d + '" stroke-width="' + f(2 * r * 0.85) + '"/>' + lineRing(cx, cy, r * 0.72, cols, r * 0.2, cols.length > 1 ? 0.22 : 0, 'butt') + xferArrows(cx, cy, r * 0.36);
  }
  // 换乘站的中心与半径：盖住本站所有车道
  function hubGeom(x, y, anchors) {
    const pts = anchors && anchors.length ? anchors : [[x, y]];
    let far = 0, ax = 0, ay = 0;
    for (const p of pts) { ax += p[0]; ay += p[1]; for (const q of pts) far = Math.max(far, U.dist(p[0], p[1], q[0], q[1])); }
    return { x: ax / pts.length, y: ay / pts.length, r: Math.max(geographic ? 11 : 12.5, far / 2 + (geographic ? 7 : 9)) };
  }
  function stationMark(s, x, y, lines, net, inter, tip, anchors, levels) {
    const attrs = 'data-st="' + s.id + '" data-lines="' + lines.join(' ') + '"', f = function (v) { return v.toFixed(1); };
    // 分层站台至少有两条线路，总是换乘站标志
    const lane = anchors && anchors.length === 1 ? anchors[0] : [x, y];
    if (!inter) return '<circle ' + attrs + ' cx="' + f(lane[0]) + '" cy="' + f(lane[1]) + '" r="' + (geographic ? 6.5 : 7.2) + '" class="nm-st" stroke="' + AX.line(net.lines[lines[0]]) + '"><title>' + U.esc(tip) + '</title></circle>';
    const G = hubGeom(x, y, anchors);
    let out = '<g ' + attrs + ' class="nm-x"><title>' + U.esc(tip) + '</title>';
    const cols = lines.map(function (l) { return AX.line(net.lines[l]); });
    out += plainHub(G.x, G.y, cols, G.r);
    if (levels && levels.length > 1) out += levelBadge(G.x + G.r * 0.9, G.y - G.r * 0.9, 15, levels);
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
    const EPS = 1e-6, GAP = 12.5;
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
  // 算出站位与每个区段的路线，供窗口与图片导出共用。
  function computeRoutes(g, net, xfers, spacing) {
    const lay = layout(net, xfers), N = lay.st.length;
    if (!N) return { lay: lay, N: 0 };
    const base = projection(net, lay, spacing);
    if (!geographic) straighten(net, lay, base, spacing);
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
    return { lay: lay, N: N, base: base, tracks: tracks, stationAnchors: stationAnchors, positions: positions, W: W, H: H };
  }
  let lastSpacing = 1;
  const hasHistory = function (g) { return !!(g && g.netGone && Object.keys(g.netGone.segments || {}).length); };
  function historyCanvas(g, spacing) {
    const H = g.netGone, net = { stations: Object.assign({}, H.stations, g.net.stations), segments: H.segments, lines: Object.assign({}, H.lines, g.net.lines) };
    const R = M.withSegIndex([net], function () { return computeRoutes(g, net, [], spacing); });
    if (!R.N) return null;
    view = { x: 0, y: 0, w: R.W, h: R.H, fullX: 0, fullY: 0, W: R.W, H: R.H };
    const canvas = h('div', { class: 'nm-canvas', html: '<svg class="nm-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + R.W + ' ' + R.H + '"></svg>' });
    canvas.appendChild(h('div', { class: 'nm-empty nm-history-empty', style: { position: 'absolute', inset: '0', pointerEvents: 'none' } }, CM.icon('network', 40), h('div', null, '当前没有运营线路，可以查看已拆除线网的成长回放。')));
    return canvas;
  }
  function build(g, spacing, attempt) {
    spacing = spacing || 1; attempt = attempt || 0; lastSpacing = spacing;
    const net = useDraft && g.draft ? g.draft.net : g.net;
    const xfers = walkTransfers(g, net);
    const R = computeRoutes(g, net, xfers, spacing), lay = R.lay, N = R.N;
    if (!N) { const archived = !useDraft && hasHistory(g) ? historyCanvas(g, spacing) : null; return archived || h('div', { class: 'nm-empty' }, CM.icon('network', 40), h('div', null, useDraft ? '草案中还没有轨道。' : '还没有运营线路。'), h('div', { class: 'tiny muted' }, '用「绘线」工具连接两座以上的车站，确认建设后会显示在这里。')); }
    const base = R.base, tracks = R.tracks, stationAnchors = R.stationAnchors, positions = R.positions, W = R.W, H = R.H;
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
      const anchors = stationAnchors.get(lay.st[i]) || [], r = linesOf[i].length > 1 || walkSet.has(i) ? hubGeom(px(i), py(i), anchors).r * 1.15 + 2 : 10;
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
        const width = 11, d = routeD(track);
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
        measure.font = '800 15px ' + font;
        const w = Math.max(28, Math.ceil(measure.measureText(txt).width) + 12), dirs = [[dx / l, dy / l], [-dy / l, dx / l], [dy / l, -dx / l], [0, -1], [0, 1], [1, 0], [-1, 0]];
        let best = null;
        for (const dist of [30, 48, 70, 96]) {
          for (const d of dirs) {
            const bx = px(i) + d[0] * (dist + w * Math.abs(d[0]) / 2), by = py(i) + d[1] * dist;
            const b = [bx - w / 2 - 2, by - 15, bx + w / 2 + 2, by + 15], ov = overlap(b);
            if (!best || ov < best.ov) best = { x: bx, y: by, b: b, ov: ov };
            if (!ov) break;
          }
          if (!best.ov) break;
        }
        index.add(best.b, 8); expand(best.b);
        endBadges += '<g data-line="' + lid + '" data-ax="' + px(i).toFixed(1) + '" data-ay="' + py(i).toFixed(1) + '"><rect x="' + (best.x - w / 2).toFixed(1) + '" y="' + (best.y - 13).toFixed(1) + '" width="' + w + '" height="26" rx="7" fill="' + AX.line(L) + '"/><text x="' + best.x.toFixed(1) + '" y="' + (best.y + 5.5).toFixed(1) + '" text-anchor="middle" class="nm-badge-t"' + (AX.enabled() ? ' style="fill:' + AX.ink(AX.line(L)) + '"' : '') + '>' + U.esc(txt) + '</text></g>';
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
      const tw = Math.ceil(Math.max.apply(null, rows.map(function (t) { return measure.measureText(t).width; }))) + 12, th = rows.length * lineHeight + 4, r = xfer || walk ? hubGeom(x, y, stationAnchors.get(s.id)).r * 1.15 + 5 : 13;
      const cands = [];
      if (lay.nb[i].length) { const a = lay.nb[i][0], vx = px(a) - x, vy = py(a) - y, l = Math.hypot(vx, vy) || 1, p = [-vy / l, vx / l], up = p[1] < -0.1 || (Math.abs(p[1]) <= 0.1 && p[0] > 0); cands.push(up ? p : [-p[0], -p[1]], up ? [-p[0], -p[1]] : p); }
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
      if (best.ov > 30 || best.dist > r + 30) needsRoom = true;
      const crowded = !geographic && attempt >= 1 && best.ov > 90 && !xfer && !walk && !leaves.has(s.id);   // 实在放不下的普通站名不写，不让文字叠在一起（点击车站可看名称）
      const tip = s.name + (xfer ? '（站内换乘：' + linesOf[i].map(function (l) { return net.lines[l].name; }).join('、') + '）' : '') + (walk ? '（可步行换乘）' : '') + ' · ' + (s.lv ? M.levelsText(M.stationLevels(net, s.id)) + '（天地换乘）' : TYPE_NAME[s.type] + '站') + ' · 点击在地图上定位';
      dots += stationMark(s, x, y, linesOf[i], net, xfer || walk, tip, stationAnchors.get(s.id), s.lv ? M.stationLevels(net, s.id) : null);
      if (crowded) continue;
      index.add(best.b, 8); expand(best.b);
      const tx = (best.b[0] + 6).toFixed(1), ty = best.b[1] + LABEL_SIZE;
      lab += '<text data-st="' + s.id + '" data-b="' + best.b[0].toFixed(1) + ' ' + best.b[1].toFixed(1) + ' ' + (best.b[2] - best.b[0]).toFixed(1) + ' ' + (best.b[3] - best.b[1]).toFixed(1) + '" data-ax="' + x.toFixed(1) + '" data-ay="' + y.toFixed(1) + '"' + (leaves.has(s.id) ? ' data-end="1"' : '') + ' x="' + tx + '" y="' + ty.toFixed(1) + '" class="nm-label' + (xfer || walk ? ' x' : '') + '" data-lines="' + linesOf[i].join(' ') + '">' + rows.map(function (text, k) { return '<tspan x="' + tx + '" y="' + (ty + k * lineHeight).toFixed(1) + '">' + U.esc(text) + '</tspan>'; }).join('') + '</text>';
    }
    if (needsRoom && attempt < 1) return build(g, spacing * 1.2, attempt + 1);
    svg += '<g class="nm-dots">' + dots + '</g><g class="nm-badges">' + endBadges + '</g><g class="nm-labels">' + lab + '</g></svg>';
    // 留足全部站名与终点编号的边距；改变画幅而不移动任何地形、轨道或站标。
    const fullW = Math.ceil(extent[2] - extent[0]), fullH = Math.ceil(extent[3] - extent[1]);
    svg = svg.replace(/viewBox="[^"]*"/, 'viewBox="' + extent[0] + ' ' + extent[1] + ' ' + fullW + ' ' + fullH + '"');
    // 地形画在最下层；在车站与站名都放好之后再放水系名称（避让它们）
    if (showTerrain) {
      lay.vw = W; lay.vh = H;
      const t = geographic ? terrainSVG(net, lay, base, boxes) : schematicWaterSVG(net, lay, base, boxes);
      const at = svg.indexOf('>') + 1; svg = svg.slice(0, at) + t + svg.slice(at);
    }
    const wrap = h('div', { class: 'nm-canvas', html: svg, style: { background: palette().paper } });
    wrap.querySelectorAll('.nm-lines > g').forEach(function (node, i) { node.dataset.order = i; });
    view = { x: extent[0], y: extent[1], w: fullW, h: fullH, W: fullW, H: fullH, fullX: extent[0], fullY: extent[1] };
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
  // 缩放（v2.7）：文字、线路和站标按同一比例缩放，和真正的地铁图一样；字小到看不清时先隐藏普通站名，再隐藏其余站名，不再单独放大文字
  function applyLOD(svg) {
    const b = box(); if (!b.width || !b.height) return;
    const px = LABEL_SIZE * Math.min(b.width / view.w, b.height / view.h);
    svg.classList.toggle('lod-a', px < 9); svg.classList.toggle('lod-b', px < 6.2);
  }
  // 平移、缩放（v2.7 性能，玩家反馈线路图拖动、缩放卡）：view 是窗口里看到的范围。SVG 比窗口四周各大半屏（见样式 .nm-canvas > .nm-svg），
  // 手势进行中只用 CSS 变换移动已经画好的图（合成层，不重画几千个线路、站标和站名），手势结束或停下 150 ms 后才按新视野
  // 重设 viewBox 重画一次、更新站名显隐。四周多画的半屏让拖动时边上不露白；放大途中略糊，停下即清晰
  let drawn = null, settle = 0;
  const box = function () {   // 画布的内框（屏幕坐标）：鼠标位置换算、站名显隐都按它算，不受 SVG 变大、变换的影响
    const c = root && root.querySelector('.nm-canvas'); if (!c) return { left: 0, top: 0, width: 0, height: 0 };
    const r = c.getBoundingClientRect(), scale = c.offsetWidth ? r.width / c.offsetWidth : 1;
    return { left: r.left + c.clientLeft * scale, top: r.top + c.clientTop * scale, width: c.clientWidth, height: c.clientHeight, scale: scale };
  };
  function commitView(svg) {
    clearTimeout(settle); settle = 0;
    const b = box(), cw = b.width, ch = b.height;
    if (!cw || !ch) { svg.setAttribute('viewBox', view.x.toFixed(1) + ' ' + view.y.toFixed(1) + ' ' + view.w.toFixed(1) + ' ' + view.h.toFixed(1)); svg.style.transform = ''; drawn = null; return; }
    const k = Math.min(cw / view.w, ch / view.h), cx = view.x + view.w / 2, cy = view.y + view.h / 2;
    const vb = [cx - cw / k, cy - ch / k, 2 * cw / k, 2 * ch / k];
    svg.setAttribute('viewBox', vb.map(function (v) { return v.toFixed(1); }).join(' '));
    svg.style.transform = '';
    drawn = { svg: svg, x: vb[0], y: vb[1], k: k, cw: cw, ch: ch };
    applyLOD(svg);
  }
  function setView(now, fromReplay) {
    if (!fromReplay && CM.NetReplay) CM.NetReplay.dirty();
    const svg = root && root.querySelector('.nm-svg'); if (!svg || !view) return;
    const b = box();
    if (now === true || !drawn || drawn.svg !== svg || b.width !== drawn.cw || b.height !== drawn.ch) { commitView(svg); return; }
    // 把按 drawn 画好的图挪到 view 的位置：屏幕坐标 = 平移 + 缩放 × 已画坐标（变换原点在 SVG 左上角，SVG 左上角在画布 (-cw/2, -ch/2)）
    const cw = b.width, ch = b.height, k = Math.min(cw / view.w, ch / view.h), A = k / drawn.k;
    const bx = (cw - view.w * k) / 2 + k * (drawn.x - view.x) + cw / 2, by = (ch - view.h * k) / 2 + k * (drawn.y - view.y) + ch / 2;
    svg.style.transform = 'translate(' + bx.toFixed(2) + 'px,' + by.toFixed(2) + 'px) scale(' + A.toFixed(5) + ')';
    clearTimeout(settle); settle = setTimeout(function () { settle = 0; if (drawn && drawn.svg === svg && svg.isConnected) commitView(svg); }, 150);
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
    setView(!tgt);   // 缓动结束时立即按新视野重画
    if (tgt) raf = requestAnimationFrame(tween); else lastT = 0;
  }
  function animateTo(v) { tgt = v; if (!raf) { lastT = performance.now(); raf = requestAnimationFrame(tween); } }
  function zoomAt(f, clientX, clientY) {
    if (CM.NetReplay) CM.NetReplay.userMoved();
    const svg = root && root.querySelector('.nm-svg'); if (!svg || !view) return;
    const r = box(), base = tgt || view;
    if (clientX == null) { clientX = r.left + r.width * r.scale / 2; clientY = r.top + r.height * r.scale / 2; }
    const s = Math.max(base.w / r.width, base.h / r.height);
    const ox = (r.width - base.w / s) / 2, oy = (r.height - base.h / s) / 2;
    const mx = base.x + ((clientX - r.left) / r.scale - ox) * s, my = base.y + ((clientY - r.top) / r.scale - oy) * s;
    const nw = U.clamp(base.w * f, Math.min(view.W * 0.5, 480), view.W * 2), k = nw / base.w;
    animateTo({ x: mx - (mx - base.x) * k, y: my - (my - base.y) * k, w: nw, h: base.h * k });
  }
  function fitView() { if (CM.NetReplay) CM.NetReplay.userMoved(); if (view) animateTo({ x: view.fullX, y: view.fullY, w: view.W, h: view.H }); }
  function bindPanZoom(canvas) {
    const svg = canvas.querySelector('.nm-svg'); if (!svg) return;
    // 画布里的控件（交互控件）自己处理鼠标：不能在这里捕获指针，否则按钮收不到点击、进度条拖不动
    const onControl = function (e) { return !!(e.target && e.target.closest && e.target.closest('button,input,select,.nr-bar')); };
    canvas.addEventListener('wheel', function (e) {
      e.preventDefault();
      if (onControl(e)) return;
      const d = e.deltaMode === 1 ? e.deltaY * 33 : e.deltaY;
      zoomAt(Math.exp(U.clamp(d, -240, 240) * 0.0022), e.clientX, e.clientY);
    }, { passive: false });
    let drag = null, pinch = null;
    const pts = new Map();   // 触屏：两指缩放
    const two = function () { const p = Array.from(pts.values()); return { d: Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y) || 1, x: (p[0].x + p[1].x) / 2, y: (p[0].y + p[1].y) / 2 }; };
    canvas.addEventListener('pointerdown', function (e) {
      if (onControl(e)) return;
      if (tgt) { tgt = null; }
      if (e.pointerType === 'touch') { pts.set(e.pointerId, { x: e.clientX, y: e.clientY }); if (pts.size === 2) { pinch = two(); drag = null; return; } }
      drag = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y, moved: false }; canvas.setPointerCapture(e.pointerId);
    });
    const lift = function (e) { pts.delete(e.pointerId); if (pts.size < 2 && pinch) { pinch = null; if (!tgt) setView(true); } };
    canvas.addEventListener('pointercancel', function (e) { lift(e); if (drag && drag.moved && !tgt) setView(true); drag = null; canvas.classList.remove('grabbing'); });
    canvas.addEventListener('pointermove', function (e) {
      if (pts.has(e.pointerId)) pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pinch && pts.size >= 2) {
        const t = two(), r = box(), s = Math.max(view.w / r.width, view.h / r.height);
        view.x -= (t.x - pinch.x) / r.scale * s; view.y -= (t.y - pinch.y) / r.scale * s; setView();
        zoomAt(pinch.d / t.d, t.x, t.y);
        pinch = t; return;
      }
      if (!drag) return;
      const r = box(), s = Math.max(view.w / r.width, view.h / r.height);
      if (Math.hypot(e.clientX - drag.x, e.clientY - drag.y) > 4) drag.moved = true;
      if (drag.moved) { if (CM.NetReplay) CM.NetReplay.userMoved(); view.x = drag.vx - (e.clientX - drag.x) / r.scale * s; view.y = drag.vy - (e.clientY - drag.y) / r.scale * s; setView(); canvas.classList.add('grabbing'); }
    });
    canvas.addEventListener('pointerup', function (e) {
      const wasPinch = !!pinch || pts.size > 1; lift(e);
      if (wasPinch) { drag = null; return; }
      const d = drag; drag = null; canvas.classList.remove('grabbing');
      if (d && d.moved && !tgt) setView(true);   // 松手立即按新视野重画
      if (!d || d.moved) return;
      const t = document.elementFromPoint(e.clientX, e.clientY);
      const el = t && t.closest ? t.closest('[data-st]') : null;
      if (el && !(CM.NetReplay && CM.NetReplay.active())) locate(el.getAttribute('data-st'));
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
    const mini = function (w, hh, vb, body) { return '<svg class="nm-svg nm-mini" width="' + w + '" height="' + hh + '" viewBox="' + vb + '">' + body + '</svg>'; };
    const sw = function (type) { return mini(34, 10, '0 0 34 10', '<path d="M3 5H31" stroke="var(--accent)" stroke-width="6.5" stroke-linecap="round"/>' + (type === 'elevated' ? '<path d="M3 5H31" class="nm-elev"/>' : (type === 'surface' ? '<path d="M3 5H31" class="nm-surf"/>' : ''))); };
    return h('div', { class: 'nm-legend' },
      h('span', { html: sw('underground') }), '地下', h('span', { html: sw('elevated') }), '高架', h('span', { html: sw('surface') }), '地面',
      h('span', { class: 'nm-lg-gap' }),
      h('span', { html: mini(24, 24, '-17 -17 34 34', lgMark('换乘站')) }), '换乘站',
      h('span', { html: mini(50, 24, '-17 -17 70 34', '<path d="M0 0H36" class="nm-walk-p"/>' + lgMark('换乘站') + '<g transform="translate(36 0)">' + lgMark('换乘站') + '</g>') }), '站外步行换乘');
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
  // 配色（v2.7）：屏幕和导出用同一份，保证导出的图和看到的一样
  // waterS：线路图江海底图的水色，比地理线网的水色深一档（参照港铁路线图）——浅色太淡时窄河道几乎看不出来
  function palette() {
    const dark = document.documentElement.getAttribute('data-theme') === 'dark';
    if (dark) return { paper: '#131b29', text: '#e8eef7', ring: '#dfe7f2', arrow: '#25334a', disc: '#fff', casing: '#131b29', walk: '#9fb2cc', water: '#1b2c43', waterS: '#23405f', green: '#19292a', greenA: 0.9, wlabel: '#7fa3c9', stW: 3.2, elev: '#fff', sub: '#a7b4c6', foot: '#7f8ea3', rule: '#2a3648' };
    return { paper: '#ffffff', text: '#1f2a3a', ring: '#25334a', arrow: '#25334a', disc: '#fff', casing: '#fff', walk: '#25334a', water: '#dcecf8', waterS: '#c6e0f5', green: '#e6f2e2', greenA: 0.65, wlabel: '#6f9cc4', stW: 3.2, elev: '#fff', sub: '#5d6b80', foot: '#9aa5b5', rule: '#e3e8ef' };
  }
  function mapFont() { return getComputedStyle(document.body).fontFamily || 'sans-serif'; }
  function mapCSS() {
    const P = palette(), S = '.nm-svg ', font = mapFont();
    return S + 'text{font-family:' + font + '}' +
      S + '.nm-elev{fill:none;stroke:' + P.elev + ';stroke-width:2.2}' + S + '.nm-surf{fill:none;stroke:' + P.elev + ';stroke-opacity:.95;stroke-width:3;stroke-dasharray:2 5;stroke-linecap:butt}' +
      S + '.nm-walk path,' + S + '.nm-walk-p{fill:none;stroke:' + P.walk + ';stroke-width:2.4;stroke-dasharray:2 5;stroke-linecap:round;opacity:.6}' +
      S + '.nm-st{fill:#fff;stroke-width:' + P.stW + '}' + S + '.nm-casing{stroke:' + P.casing + '}' +
      S + '.nm-xo{fill:none;stroke:' + P.ring + ';stroke-linecap:round}' + S + '.nm-xf{fill:none;stroke:' + P.disc + ';stroke-linecap:round}' + S + '.nm-xg{fill:none;stroke:' + P.arrow + ';stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round}' +
      S + '.nm-label{font-size:' + LABEL_SIZE + 'px;font-weight:500;fill:' + P.text + ';paint-order:stroke;stroke:' + P.paper + ';stroke-width:4px;stroke-linejoin:round}' + S + '.nm-label.x{font-weight:700}' +
      S + '.nm-badge-t{font-size:15px;font-weight:800;fill:#fff}' +
      S + '.nm-water{fill:' + P.water + ';stroke:none}' + S + '.nm-river path{stroke:' + P.water + '}' + S + '.nm-green{fill:' + P.green + ';opacity:' + P.greenA + '}' + S + '.nm-wlabel{font-size:12.5px;font-style:italic;letter-spacing:2px;fill:' + P.wlabel + '}' +
      // 线路图的示意水面描一圈同色边，窄水道简化后也不会断开；水面与轨道共用当前排版
      S + '.nm-terrain.schem .nm-water{fill:' + P.waterS + ';stroke:' + P.waterS + ';stroke-width:4px}' + S + '.nm-terrain.schem .nm-river path{stroke:' + P.waterS + '}' +
      '.nm-svg.replaying .nm-terrain.schem,.nm-svg.replaying .nm-lines,.nm-svg.replaying .nm-casing,.nm-svg.replaying .nm-dots,.nm-svg.replaying .nm-badges,.nm-svg.replaying .nm-labels,.nm-svg.replaying .nm-walk,.nm-svg.replaying .nm-line-ids{display:none}' +
      '.nm-svg.lod-a .nm-label:not(.x):not([data-end]){display:none}.nm-svg.lod-b .nm-label,.nm-svg.lod-b .nm-wlabel{display:none}';
  }
  let exporting = false;
  const canExport = function () { const g = game(), net = g && (useDraft && g.draft ? g.draft.net : g.net); return !!(net && Object.keys(net.segments).length); };
  // 按钮文字放在自己的元素里，只改这一处（v2.7）：不依赖子节点顺序，反复导出也不会叠字
  function setExporting(on) {
    exporting = on;
    const b = root && root.querySelector('.nm-export'); if (!b) return;
    b.disabled = on || !canExport() || !!(CM.NetReplay && CM.NetReplay.active());
    const t = b.querySelector('.nm-export-t'); if (t) t.textContent = on ? '正在导出…' : '导出 PNG';
    if (on) b.blur();
  }
  function exportPNG() {
    const g = game(), svg = root && root.querySelector('.nm-svg');
    if (!g || !svg || !view || exporting || !canExport() || (CM.NetReplay && CM.NetReplay.active())) return;
    setExporting(true);
    const fail = function (msg) { setExporting(false); ui.toast('导出失败：' + msg, 'bad'); };
    const net = useDraft && g.draft ? g.draft.net : g.net, D = CM.DATA, isGeo = geographic;
    const font = mapFont(), P = palette();
    const W = view.W, H = view.H;
    const clone = svg.cloneNode(true);
    clone.setAttribute('viewBox', view.fullX + ' ' + view.fullY + ' ' + W + ' ' + H);
    clone.setAttribute('width', W.toFixed(0)); clone.setAttribute('height', H.toFixed(0));
    clone.removeAttribute('style');   // 平移途中的临时变换不带进导出图
    clone.classList.remove('focusing', 'lod-a', 'lod-b', 'replaying');
    clone.querySelectorAll('.on').forEach(function (el) { el.classList.remove('on'); });
    const layer = clone.querySelector('.nm-lines');
    if (layer) Array.from(layer.children).sort(function (a, b) { return Number(a.dataset.order) - Number(b.dataset.order); }).forEach(function (node) { layer.appendChild(node); });
    const st = document.createElementNS('http://www.w3.org/2000/svg', 'style'); st.textContent = mapCSS();
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
      const drawText = c.fillText.bind(c);
      c.fillText = function (text, ...args) { drawText(CM.I18n ? CM.I18n.text(String(text)) : text, ...args); };
      const INK = P.text;
      c.fillStyle = P.paper; c.fillRect(0, 0, cw, ch);
      c.fillStyle = INK; c.textBaseline = 'alphabetic';
      c.font = '800 ' + (30 * sc) + 'px ' + font; c.fillText((D.city || '') + (isGeo ? '地铁地理线网图' : '地铁线路示意图'), M0, 56 * sc);
      c.font = (15 * sc) + 'px ' + font; c.fillStyle = P.sub;
      let nSt = 0; for (const id in net.stations) if (M.stationLines(net, id).length) nSt++;
      const KM = lineKm(g);
      c.fillText('游戏时间 ' + g.clock.y + ' 年 ' + g.clock.m + ' 月' + (useDraft ? '（含建设草案）' : '') + ' · ' + lines.length + ' 条线路 · ' + nSt + ' 座车站 · 线路总长 ' + kmText(KM.total) + ' · 《城市与地铁》', M0, 84 * sc);
      c.drawImage(img, (cw - W * sc) / 2, headH, W * sc, H * sc);
      // 线路图例
      let y = headH + H * sc + 18 * sc;
      c.strokeStyle = P.rule; c.lineWidth = 1 * sc; c.beginPath(); c.moveTo(M0, y); c.lineTo(cw - M0, y); c.stroke();
      y += 30 * sc;
      lines.forEach(function (o, k) {
        const x = M0 + (k % cols) * 220 * sc, yy = y + Math.floor(k / cols) * 34 * sc;
        c.fillStyle = AX.line(o.L); c.beginPath(); c.roundRect ? c.roundRect(x, yy - 14 * sc, 30 * sc, 20 * sc, 6 * sc) : c.rect(x, yy - 14 * sc, 30 * sc, 20 * sc); c.fill();
        c.fillStyle = AX.ink(AX.line(o.L)); c.font = '800 ' + (12 * sc) + 'px ' + font; c.textAlign = 'center'; c.fillText(M.lineBadge(o.L), x + 15 * sc, yy + 1 * sc);
        c.textAlign = 'left'; c.fillStyle = INK; c.font = '600 ' + (14 * sc) + 'px ' + font; c.fillText(o.L.name, x + 40 * sc, yy);
        const nw = c.measureText(CM.I18n ? CM.I18n.text(o.L.name) : o.L.name).width;
        c.fillStyle = P.sub; c.font = (12 * sc) + 'px ' + font; c.fillText(o.tp.stations.length + ' 站 · ' + kmText(KM.get(o.id)), x + 48 * sc + nw, yy);
      });
      c.fillStyle = P.foot; c.font = (12 * sc) + 'px ' + font; c.textAlign = 'right';
      c.fillText('线型：实线为地下，带白色中线为高架，带白色枕木纹为地面；⇄ 圆环为换乘站，虚线相连为站外步行换乘', cw - M0, ch - 38 * sc);
      c.fillText(isGeo ? '按游戏地图中的实际站点、轨道与地形等比例绘制；共线区间以同心色带区分，站外虚线只表示换乘联系。' : '线路只走水平、竖直和 45° 方向，站距统一，不代表实际距离；同向线路并排绘制，江河湖海只示意大致位置。', cw - M0, ch - 20 * sc);
      c.textAlign = 'left';
      cv.toBlob(function (blob) {
        if (!blob) { fail('无法生成图片'); return; }
        const filename = (isGeo ? '地铁地理线网图-' : '地铁线路示意图-') + (D.city || '城市') + '-' + g.clock.y + '年' + g.clock.m + '月.png';
        try { U.downloadBlob(blob, filename); ui.toast('已导出线路示意图（' + cv.width + '×' + cv.height + ' PNG）', 'good'); setExporting(false); } catch (e) { fail('无法保存图片：' + e.message); }
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
    if (CM.NetReplay) CM.NetReplay.stop(true);
    root.innerHTML = '';
    root.appendChild(h('style', { html: mapCSS() }));
    const chips = h('div', { class: 'nm-chips' }), KM = lineKm(g);
    for (const lid of M.sortIds(Object.keys(net.lines))) {
      const L = net.lines[lid], tp = M.lineTopo(net, lid);
      if (tp.topo === 'empty') continue;
      chips.appendChild(h('button', { class: 'nm-chip', 'data-id': lid, 'data-silent': '1', 'data-tip': M.TOPO_NAME[tp.topo] + ' · 点击突出显示', onclick: function () { focus = focus === lid ? null : lid; applyFocus(); } }, h('span', { class: 'swatch', style: { background: AX.line(L) } }), L.name, h('span', { class: 'nm-chip-n muted' }, tp.stations.length + ' 站 · ' + kmText(KM.get(lid)))));
    }
    // 线路多时条目放不下：滚轮横向滚动
    chips.addEventListener('wheel', function (e) { if (chips.scrollWidth > chips.clientWidth && Math.abs(e.deltaY) > Math.abs(e.deltaX)) { chips.scrollLeft += e.deltaY; e.preventDefault(); } }, { passive: false });
    const nLines = chips.childNodes.length, nStations = Object.keys(net.stations).filter(function (sid) { return M.stationLines(net, sid).length; }).length;
    const head = h('div', { class: 'stats-head nm-head' }, h('span', { class: 'badge b-blue' }, CM.icon('network')),
      h('div', { class: 'nm-heading' }, h('h2', null, (CM.DATA.city || '') + '地铁线网'), h('div', { class: 'tiny muted' }, g.clock.y + ' 年 ' + g.clock.m + ' 月')),
      h('div', { class: 'seg-ctl sm nm-mode', 'aria-label': '线路图布局' }, [[true, '地理线网'], [false, '线路图']].map(function (o) { return h('button', { class: geographic === o[0] ? 'on' : '', 'data-mode': o[0] ? 'geographic' : 'schematic', 'aria-pressed': geographic === o[0] ? 'true' : 'false', 'data-silent': '1', onclick: function () { if (geographic !== o[0]) { geographic = o[0]; CM.Sound && CM.Sound.play('soft'); render(); } } }, o[1]); })),
      hasDraft ? h('div', { class: 'seg-ctl sm' }, [[false, '正式网络'], [true, '含草案']].map(function (o) { return h('button', { class: useDraft === o[0] ? 'on' : '', 'data-silent': '1', onclick: function () { if (useDraft !== o[0]) { useDraft = o[0]; focus = null; render(); } } }, o[1]); })) : null,
      h('div', { class: 'grow' }),
      h('button', { class: 'btn sm nm-replay', 'aria-label': '成长回放', 'data-tip': '从第一条线开始回放线网的成长，线路随时代平滑变化', disabled: (!nLines && !hasHistory(g)) || useDraft, onclick: function () { if (CM.NetReplay) CM.NetReplay.start(API); } }, CM.icon('play'), '成长回放'),
      h('div', { class: 'nm-tools' },
        h('button', { class: 'hbtn', 'data-tip': '放大', onclick: function () { zoomAt(0.7); } }, CM.icon('plus')),
        h('button', { class: 'hbtn', 'data-tip': '缩小', onclick: function () { zoomAt(1 / 0.7); } }, CM.icon('minus')),
        h('button', { class: 'hbtn', 'data-tip': '显示全部', onclick: fitView }, CM.icon('expand')),
        h('button', { class: 'hbtn' + (showTerrain ? ' on' : ''), 'aria-label': '查看地形', 'data-tip': geographic ? (showTerrain ? '隐藏地形（江河、湖海与山林）' : '显示地形（江河、湖海与山林）') : (showTerrain ? '隐藏江河湖海底图' : '显示江河湖海底图'), 'data-silent': '1', onclick: function () { showTerrain = !showTerrain; CM.Sound && CM.Sound.play('toggle'); render(true); } }, CM.icon('mountain'))),
      h('button', { class: 'btn sm nm-export', 'aria-label': '导出 PNG', 'data-tip': '导出完整的图（含标题与线路图例）', disabled: exporting || !nLines, onclick: exportPNG }, CM.icon('export'), h('span', { class: 'nm-export-t' }, exporting ? '正在导出…' : '导出 PNG')),
      h('button', { class: 'hbtn nm-close', 'data-tip': '关闭', 'data-key': 'Esc', onclick: function () { NetMap.close(); } }, CM.icon('close')));
    tgt = null;
    const canvas = build(g);
    if (!canvas.classList.contains('nm-canvas')) head.querySelectorAll('.nm-tools button, .btn').forEach(function (b) { b.disabled = true; });
    const bar = h('div', { class: 'nm-bar' }, nLines ? h('div', { class: 'nm-sum' }, nLines + ' 条线路 · ' + nStations + ' 座车站 · ' + kmText(KM.total)) : null, nLines ? chips : null);
    if (canvas.classList.contains('nm-canvas')) canvas.appendChild(h('div', { class: 'nm-foot' }, legend(), h('span', { class: 'nm-hint' }, '滚轮缩放 · 拖动平移 · 点击车站定位')));
    const body = h('div', { class: 'nm-body' }, bar, canvas);
    // 只有打开时播放入场动画；打开后切换正式 / 含草案或网络变化时就地重绘，不闪动
    const win = h('div', { class: 'stats-win nm-win' + (fresh ? '' : ' static'), onclick: function (e) { e.stopPropagation(); } }, head, body);
    fresh = false;
    root.appendChild(win);
    if (savedView && view && savedView.W === view.W && savedView.H === view.H) { Object.assign(view, savedView); setView(); }
    else if (canvas.classList.contains('nm-canvas')) setView();
    root.onclick = function () { NetMap.close(); };
    if (canvas.classList.contains('nm-canvas')) bindPanZoom(canvas);
    if (focus && !net.lines[focus]) focus = null;
    applyFocus();
  }

  let openJob = 0;
  // 给成长回放用（netreplay.js）
  const API = {
    root: function () { return root; }, canvas: function () { return root && root.querySelector('.nm-canvas'); }, svg: function () { return root && root.querySelector('.nm-svg'); },
    // 回放跟镜头时直接按新视野重画（回放中大部分图层隐藏，重画很轻）
    view: function () { return view; }, setView: function () { setView(true, true); }, fitView: fitView, geographic: function () { return geographic; }, spacing: function () { return lastSpacing; },
    computeRoutes: computeRoutes, hubGeom: hubGeom, palette: palette, medianSpacing: medianSpacing,
    waterLayer: function (G, P, med) { return showTerrain ? waterLayer(game() && game().city, G, P, med) : null; }, mapFont: mapFont, ui: function () { return ui; },
    setBusy: function (on) { const b = root && root.querySelector('.nm-export'); if (b) b.disabled = on || exporting || !canExport(); },
  };
  const NetMap = {
    open: function (u) {
      if (CM.NetReplay) CM.NetReplay.stop(true);
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
    close: function () { tgt = null; ++openJob; if (CM.NetReplay) CM.NetReplay.stop(true); if (root) { root.classList.add('hidden'); root.innerHTML = ''; } },
    exportPNG: function () { exportPNG(); },
    paper: function () { return palette().paper; },
    // 当前线网的线路图缩略图（城市总评的海报用）：不打开窗口，也不改变窗口里正在看的内容
    snapshot: function (maxW) {
      return new Promise(function (resolve) {
        const g = game(); if (!g) { resolve(null); return; }
        const sg = geographic, su = useDraft, v0 = view; let el = null, v = null;
        try { geographic = false; useDraft = false; M.withSegIndex([g.net], function () { el = build(g); }); v = view; } catch (e) { console.error(e); }
        geographic = sg; useDraft = su; view = v0;
        const svg = el && el.querySelector ? el.querySelector('.nm-svg') : null;
        if (!svg || !v) { resolve(null); return; }
        const P = palette(), sc = Math.min(maxW / v.W, 1500 / v.H, 2), cw = Math.round(v.W * sc), ch = Math.round(v.H * sc);
        svg.setAttribute('viewBox', v.fullX + ' ' + v.fullY + ' ' + v.W + ' ' + v.H); svg.setAttribute('width', cw); svg.setAttribute('height', ch);
        const st = document.createElementNS('http://www.w3.org/2000/svg', 'style'); st.textContent = mapCSS(); svg.insertBefore(st, svg.firstChild);
        const img = new Image();
        img.onload = function () { try { const cv = document.createElement('canvas'); cv.width = cw; cv.height = ch; const c = cv.getContext('2d'); c.fillStyle = P.paper; c.fillRect(0, 0, cw, ch); c.drawImage(img, 0, 0, cw, ch); resolve(cv.toDataURL('image/webp', 0.82)); } catch (e) { console.error(e); resolve(null); } };
        img.onerror = function () { resolve(null); };
        img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(new XMLSerializer().serializeToString(svg));
      });
    },
    isOpen: function () { return !!root && !root.classList.contains('hidden'); },
    refresh: function (keepView) { if (NetMap.isOpen()) render(!!keepView); },
  };
  CM.NetMap = NetMap;
})(window.CM);
