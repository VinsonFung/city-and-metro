'use strict';
// 真实地理数据（OpenStreetMap）：解码、栅格化与空间索引。坐标单位为格（250 m）。
(function (CM) {
  const U = CM.U;
  const Geo = { ready: false };
  CM.Geo = Geo;

  // 增量编码折线 → Float32Array [x0,y0,x1,y1,…]
  function dec(s, from) {
    const out = [];
    let i = from || 0, x = 0, y = 0;
    while (i < s.length) {
      let r = 0, sh = 0, b;
      do { b = s.charCodeAt(i++) - 63; r |= (b & 31) << sh; sh += 5; } while (b >= 32);
      x += (r & 1) ? ~(r >> 1) : (r >> 1);
      r = 0; sh = 0;
      do { b = s.charCodeAt(i++) - 63; r |= (b & 31) << sh; sh += 5; } while (b >= 32);
      y += (r & 1) ? ~(r >> 1) : (r >> 1);
      out.push(x / 64, y / 64);
    }
    return new Float32Array(out);
  }
  Geo.dec = dec;
  Geo.bbox = function (p) { return bboxOf(p); };
  function bboxOf(p, bb) {
    bb = bb || [1e9, 1e9, -1e9, -1e9];
    for (let k = 0; k < p.length; k += 2) { const x = p[k], y = p[k + 1]; if (x < bb[0]) bb[0] = x; if (y < bb[1]) bb[1] = y; if (x > bb[2]) bb[2] = x; if (y > bb[3]) bb[3] = y; }
    return bb;
  }
  // 环的方向统一：外环有向面积为正、内环为负。合并多个要素后按 nonzero 填充，彼此重叠的水面（如“什刹海”整体与“后海”“前海”）叠加而不是按奇偶规则互相抵消成空白
  function orient(p, outer) {
    let a = 0;
    for (let k = 0, n = p.length; k < n; k += 2) { const m = (k + 2) % n; a += p[k] * p[m + 1] - p[m] * p[k + 1]; }
    if ((a > 0) === outer || a === 0) return p;
    const q = new Float32Array(p.length);
    for (let k = 0, n = p.length; k < n; k += 2) { q[k] = p[n - 2 - k]; q[k + 1] = p[n - 1 - k]; }
    return q;
  }
  Geo.orient = orient;   // 地图缩略图（maps.js）同样合并后按 nonzero 填充
  function polyFeat(row, names) {
    const f = { name: names[row[0]] || '', rings: [], bbox: null };
    for (let k = 1; k < row.length; k++) { const s = row[k], outer = s[0] === 'o'; const p = orient(dec(s, 1), outer); f.rings.push({ outer: outer, p: p }); f.bbox = bboxOf(p, f.bbox); }
    return f;
  }

  // 编码：与 dec 相反（坐标 ×64 取整后差分，zigzag，每 5 位一个字符）；虚构地图（新手教程）用它把坐标写成同样的格式
  Geo.enc = function (pts) {
    let s = '', px = 0, py = 0;
    const put = function (v) { let u = v < 0 ? ~(v << 1) : (v << 1); while (u >= 32) { s += String.fromCharCode((32 | (u & 31)) + 63); u >>>= 5; } s += String.fromCharCode(u + 63); };
    for (let k = 0; k + 1 < pts.length; k += 2) { const x = Math.round(pts[k] * 64), y = Math.round(pts[k + 1] * 64); put(x - px); put(y - py); px = x; py = y; }
    return s;
  };
  // 解码结果按数据源缓存：切换地图时不必重新解码
  const cache = new Map();
  Geo.forget = function (G) { if (Geo.src !== G) cache.delete(G); };
  const KEYS = ['names', 'water', 'waterLines', 'roads', 'streets', 'rail', 'parks', 'reserves', 'woods', 'admin', 'places', 'streetBk'];
  Geo.init = function () {
    if (Geo.ready && Geo.src === CM.GEO) return Geo;
    const G = CM.GEO, names = G.names;
    const hit = cache.get(G);
    if (hit) { for (const k of KEYS) Geo[k] = hit[k]; Geo.src = G; Geo.ready = true; return Geo; }
    Geo.names = names;
    Geo.water = []; Geo.waterLines = [];
    for (const row of G.water) {
      if (typeof row[1] === 'number') { const p = dec(row[2]); Geo.waterLines.push({ name: names[row[0]] || '', w: row[1], p: p, bbox: bboxOf(p) }); }
      else Geo.water.push(polyFeat(row, names));
    }
    // 水面上的细碎陆地（v2.2）：水面多边形中面积很小（约 3,800 m² 以下的礁石、小块）或很细长（宽约 30 m 以下的防波堤、窄码头）的洞
    // 按水面处理，画面上不再出现一条条白线与碎块；较宽的码头、填海地与岛屿保留
    const ringStat = function (p) { let a = 0, l = 0; const n = p.length / 2; for (let k = 0; k < n; k++) { const j = (k + 1) % n, x0 = p[2 * k], y0 = p[2 * k + 1], x1 = p[2 * j], y1 = p[2 * j + 1]; a += x0 * y1 - x1 * y0; l += Math.hypot(x1 - x0, y1 - y0); } return [Math.abs(a) / 2, l]; };
    for (const f of Geo.water) f.rings = f.rings.filter(function (r) { if (r.outer) return true; const s = ringStat(r.p); return !(s[0] < 0.06 || (s[0] < 1.5 && s[0] / (s[1] || 1) < 0.065)); });
    Geo.roads = G.roads.map(function (r) { const p = dec(r[3]); return { name: names[r[0]] || '', cls: r[1], flags: r[2], p: p, bbox: bboxOf(p) }; });
    Geo.streets = G.streets ? G.streets.split('!').map(function (s) { const p = dec(s); return { p: p, bbox: bboxOf(p) }; }) : [];
    Geo.rail = G.rail.map(function (r) { const p = dec(r[2]); return { name: names[r[0]] || '', flags: r[1], p: p, bbox: bboxOf(p), year: r[3] || 0 }; });   // year：开通年份（可缺省）
    // 地图数据的 railYears（v2.9）：线路名（完全相同或前缀）→ 通车年份，或 [通车, 停运]；写了年份的线路 dated，通车后即使全在隧道里也显示
    { const RY = CM.DATA.railYears; if (RY) for (const r of Geo.rail) {
      if (!r.name) continue;
      let v = RY[r.name], bl = 0;
      if (v == null) for (const k in RY) if (k.length > bl && r.name.indexOf(k) === 0) { v = RY[k]; bl = k.length; }
      if (v == null) continue;
      r.dated = true; if (Array.isArray(v)) { r.year = v[0]; r.close = v[1]; } else r.year = v;
    } }
    Geo.parks = G.parks.map(function (r) { return polyFeat(r, names); });
    Geo.reserves = G.reserves.map(function (r) { return polyFeat(r, names); });
    Geo.woods = G.woods.map(function (r) { return polyFeat(r, names); });
    Geo.admin = (G.admin || []).map(function (r) { const f = polyFeat(r.slice(1), names); f.level = r[0]; return f; });
    Geo.places = G.places || [];
    Geo.streetBk = Geo.buckets(Geo.streets, 4, CM.CFG.W, CM.CFG.H);
    const saved = {}; for (const k of KEYS) saved[k] = Geo[k];
    cache.set(G, saved);
    Geo.src = G; Geo.ready = true;
    return Geo;
  };
  // 去台阶（v3.4 玩家反馈：有些地图的小岛、岸线近看有格子状锯齿）：较早生成的地图（香港、纽约、新加坡、迈阿密、悉尼、深圳、台北、上海等）
  // 海面是从栅格描出来的，环上满是 1/R 格的直角台阶；巴黎、东京的部分林地与公园也是。只给画面用一份平滑后的副本（Geo.view）：
  // 台阶多的环先把短的轴向边换成中点（直角切成斜边，长直边保留两端点，人工岸线与地图外框的角不被切掉），再平滑三遍、略作简化。
  // 模拟（水域栅格、林地覆盖、填海）仍用原始数据，存档与交通模型不受影响
  const STAIR_MIN = 0.12;   // 台阶拐点占比超过这个值的环才处理
  Geo.smoothRing = function (p, outer) {
    const n = p.length / 2; if (n < 8) return p;
    let st = 0; const ax = [];
    for (let i = 0; i < n; i++) {
      const a = (i + n - 1) % n, c = (i + 1) % n, ux = p[2 * i] - p[2 * a], uy = p[2 * i + 1] - p[2 * a + 1], vx = p[2 * c] - p[2 * i], vy = p[2 * c + 1] - p[2 * i + 1];
      const lu = Math.abs(ux) + Math.abs(uy), lv = Math.abs(vx) + Math.abs(vy), axU = ux === 0 || uy === 0, axV = vx === 0 || vy === 0;
      if (axU && lu <= 0.3) ax.push(lu);
      if (axU && axV && lu <= 0.3 && lv <= 0.3 && ux * vx + uy * vy === 0) st++;
    }
    if (st < n * STAIR_MIN || !ax.length) return p;
    ax.sort(function (a, b) { return a - b; });
    const step = Math.max(1 / 64, ax[ax.length >> 1]), short = Math.max(step * 2.5, 0.3), m = [];
    const put = function (x, y) { const l = m.length; if (l && Math.abs(m[l - 2] - x) < 1e-6 && Math.abs(m[l - 1] - y) < 1e-6) return; m.push(x, y); };
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n, x0 = p[2 * i], y0 = p[2 * i + 1], x1 = p[2 * j], y1 = p[2 * j + 1];
      if ((x0 === x1 || y0 === y1) && Math.abs(x1 - x0) + Math.abs(y1 - y0) <= short) put((x0 + x1) / 2, (y0 + y1) / 2);
      else { put(x0, y0); put(x1, y1); }
    }
    const k = m.length / 2; if (k < 4) return p;
    // 切成斜边后仍是 45° 的锯齿（台阶粗的地图约 60 m 一个）：拉普拉斯平滑三遍，短边上的点向两邻点的平均靠拢，长直边的端点不动
    const lim = short * 1.2, fixed = new Uint8Array(k);
    for (let i = 0; i < k; i++) { const a = (i + k - 1) % k, c = (i + 1) % k; if (Math.hypot(m[2 * i] - m[2 * a], m[2 * i + 1] - m[2 * a + 1]) > lim || Math.hypot(m[2 * c] - m[2 * i], m[2 * c + 1] - m[2 * i + 1]) > lim) fixed[i] = 1; }
    for (let it = 0; it < 3; it++) {
      const q = m.slice();
      for (let i = 0; i < k; i++) { if (fixed[i]) continue; const a = (i + k - 1) % k, c = (i + 1) % k; q[2 * i] = 0.25 * m[2 * a] + 0.5 * m[2 * i] + 0.25 * m[2 * c]; q[2 * i + 1] = 0.25 * m[2 * a + 1] + 0.5 * m[2 * i + 1] + 0.25 * m[2 * c + 1]; }
      for (let i = 0; i < m.length; i++) m[i] = q[i];
    }
    // 闭合环的道格拉斯—普克：从离首点最远的点切成两段分别简化（容差很小，只去掉平滑后多余的点）
    const tol = U.clamp(step * 0.15, 0.01, 0.03), keep = new Uint8Array(k);
    let far = 0, fd = -1; for (let i = 1; i < k; i++) { const d = (m[2 * i] - m[0]) ** 2 + (m[2 * i + 1] - m[1]) ** 2; if (d > fd) { fd = d; far = i; } }
    const dp = function (a, b) {   // a、b 为环上的下标（b 可以绕回），保留两端，递归保留偏离最大的点
      const st2 = [[a, b]];
      while (st2.length) {
        const q = st2.pop(), i0 = q[0], i1 = q[1]; if (i1 - i0 < 2) continue;
        const A = i0 % k, B = i1 % k, axx = m[2 * A], ayy = m[2 * A + 1], dx = m[2 * B] - axx, dy = m[2 * B + 1] - ayy, L = Math.hypot(dx, dy) || 1e-9;
        let bi = -1, bd = tol;
        for (let i = i0 + 1; i < i1; i++) { const I = i % k, d = Math.abs((m[2 * I] - axx) * dy - (m[2 * I + 1] - ayy) * dx) / L; if (d > bd) { bd = d; bi = i; } }
        if (bi >= 0) { keep[bi % k] = 1; st2.push([i0, bi], [bi, i1]); }
      }
    };
    keep[0] = keep[far] = 1; dp(0, far); dp(far, k);
    const out = []; for (let i = 0; i < k; i++) if (keep[i]) out.push(m[2 * i], m[2 * i + 1]);
    return out.length >= 6 ? orient(new Float32Array(out), outer) : p;
  };
  const viewCache = new WeakMap();
  Geo.view = function (key) {
    const src = Geo[key]; if (!src || !src.length) return src || [];
    let v = viewCache.get(src); if (v) return v;
    v = src.map(function (f) {
      let ch = false;
      const rings = f.rings.map(function (r) { const q = Geo.smoothRing(r.p, r.outer); if (q === r.p) return r; ch = true; return { outer: r.outer, p: q }; });
      if (!ch) return f;
      let bb = null; for (const r of rings) bb = bboxOf(r.p, bb);
      return Object.assign({}, f, { rings: rings, bbox: bb });
    });
    viewCache.set(src, v); return v;
  };
  // 丢掉某一数据源的解码结果（v3.0 内存）：该地图的完整地理数据被释放时（maps.js releaseGeo）一并释放，正在使用的不动
  Geo.forget = function (G) { if (G !== Geo.src) cache.delete(G); };

  // 多边形扫描线填充（每个要素内部按奇偶规则，要素之间取并集）。S 为每格子像素数。
  Geo.fill = function (mask, FW, FH, S, feats, valueOf) {
    for (let fi = 0; fi < feats.length; fi++) {
      const f = feats[fi], val = valueOf ? valueOf(f, fi) : 1;
      if (!val) continue;
      const bb = f.bbox; if (!bb) continue;
      const y0 = Math.max(0, Math.floor(bb[1] * S)), y1 = Math.min(FH - 1, Math.ceil(bb[3] * S));
      // 边表
      const ex = [];
      for (const r of f.rings) {
        const p = r.p, n = p.length / 2;
        for (let k = 0; k < n; k++) {
          const j = (k + 1) % n;
          const ax = p[2 * k] * S, ay = p[2 * k + 1] * S, bx = p[2 * j] * S, by = p[2 * j + 1] * S;
          if (ay === by) continue;
          ex.push(ay < by ? [ay, by, ax, (bx - ax) / (by - ay)] : [by, ay, bx, (ax - bx) / (ay - by)]);
        }
      }
      ex.sort(function (a, b) { return a[0] - b[0]; });
      const act = []; let ei = 0;
      const xs = [];
      for (let y = y0; y <= y1; y++) {
        const cy = y + 0.5;
        while (ei < ex.length && ex[ei][0] <= cy) act.push(ex[ei++]);
        xs.length = 0;
        for (let k = act.length - 1; k >= 0; k--) {
          const e = act[k];
          if (e[1] <= cy) { act.splice(k, 1); continue; }
          if (e[0] <= cy) xs.push(e[2] + (cy - e[0]) * e[3]);
        }
        xs.sort(function (a, b) { return a - b; });
        const row = y * FW;
        for (let k = 0; k + 1 < xs.length; k += 2) {
          const a = Math.max(0, Math.ceil(xs[k] - 0.5)), b = Math.min(FW - 1, Math.floor(xs[k + 1] - 0.5));
          if (a <= b) mask.fill(val, row + a, row + b + 1);
        }
      }
    }
  };
  // 粗线栅格化（半宽 hw，单位格）
  Geo.stroke = function (mask, FW, FH, S, p, hw, val, onlyIf) {
    const r = hw * S, r2 = r * r;
    for (let k = 0; k + 3 < p.length; k += 2) {
      const ax = p[k] * S, ay = p[k + 1] * S, bx = p[k + 2] * S, by = p[k + 3] * S;
      const x0 = Math.max(0, Math.floor(Math.min(ax, bx) - r)), x1 = Math.min(FW - 1, Math.ceil(Math.max(ax, bx) + r));
      const y0 = Math.max(0, Math.floor(Math.min(ay, by) - r)), y1 = Math.min(FH - 1, Math.ceil(Math.max(ay, by) + r));
      const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy;
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          const px = x + 0.5, py = y + 0.5;
          let t = L > 0 ? ((px - ax) * dx + (py - ay) * dy) / L : 0; t = t < 0 ? 0 : (t > 1 ? 1 : t);
          const qx = ax + dx * t - px, qy = ay + dy * t - py;
          if (qx * qx + qy * qy <= r2) { const i = y * FW + x; if (!onlyIf || onlyIf(mask[i])) mask[i] = val; }
        }
      }
    }
  };
  // 有符号距离场（倒角距离，单位：子像素）：陆地为正（到水面距离），水面为负（到岸距离）
  Geo.sdf = function (mask, FW, FH) {
    const INF = 1e9, a = new Float32Array(FW * FH), b = new Float32Array(FW * FH);
    for (let i = 0; i < a.length; i++) { const w = mask[i] > 0; a[i] = w ? 0 : INF; b[i] = w ? INF : 0; }
    const pass = function (d) {
      const D1 = 1, D2 = 1.4142;
      for (let y = 0; y < FH; y++) for (let x = 0; x < FW; x++) {
        const i = y * FW + x; let v = d[i];
        if (x > 0) v = Math.min(v, d[i - 1] + D1);
        if (y > 0) { v = Math.min(v, d[i - FW] + D1); if (x > 0) v = Math.min(v, d[i - FW - 1] + D2); if (x < FW - 1) v = Math.min(v, d[i - FW + 1] + D2); }
        d[i] = v;
      }
      for (let y = FH - 1; y >= 0; y--) for (let x = FW - 1; x >= 0; x--) {
        const i = y * FW + x; let v = d[i];
        if (x < FW - 1) v = Math.min(v, d[i + 1] + D1);
        if (y < FH - 1) { v = Math.min(v, d[i + FW] + D1); if (x < FW - 1) v = Math.min(v, d[i + FW + 1] + D2); if (x > 0) v = Math.min(v, d[i + FW - 1] + D2); }
        d[i] = v;
      }
    };
    pass(a); pass(b);
    const out = new Float32Array(FW * FH);
    for (let i = 0; i < out.length; i++) out[i] = mask[i] > 0 ? -(b[i] - 0.5) : (a[i] - 0.5);
    return out;
  };
  // 每格覆盖率（0..1）
  Geo.coverage = function (mask, FW, S, W, H, test) {
    const out = new Float32Array(W * H), n = S * S;
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
      let c = 0;
      for (let y = 0; y < S; y++) { const row = (j * S + y) * FW + i * S; for (let x = 0; x < S; x++) if (test ? test(mask[row + x]) : mask[row + x]) c++; }
      out[j * W + i] = c / n;
    }
    return out;
  };
  // 空间分桶（按要素外包框）：tile 为桶边长（格）
  Geo.buckets = function (items, tile, W, H) {
    const TW = Math.ceil(W / tile), TH = Math.ceil(H / tile), b = new Array(TW * TH);
    for (let k = 0; k < b.length; k++) b[k] = [];
    items.forEach(function (it, idx) {
      const bb = it.bbox;
      const i0 = U.clamp(Math.floor(bb[0] / tile), 0, TW - 1), i1 = U.clamp(Math.floor(bb[2] / tile), 0, TW - 1);
      const j0 = U.clamp(Math.floor(bb[1] / tile), 0, TH - 1), j1 = U.clamp(Math.floor(bb[3] / tile), 0, TH - 1);
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) b[j * TW + i].push(idx);
    });
    return { tile: tile, TW: TW, TH: TH, b: b };
  };
  // 查询范围内的要素序号（去重）
  Geo.query = function (bk, x0, y0, x1, y1, seen) {
    const out = [], t = bk.tile;
    const i0 = U.clamp(Math.floor(x0 / t), 0, bk.TW - 1), i1 = U.clamp(Math.floor(x1 / t), 0, bk.TW - 1);
    const j0 = U.clamp(Math.floor(y0 / t), 0, bk.TH - 1), j1 = U.clamp(Math.floor(y1 / t), 0, bk.TH - 1);
    seen = seen || new Set();
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) for (const k of bk.b[j * bk.TW + i]) if (!seen.has(k)) { seen.add(k); out.push(k); }
    return out;
  };
  // ---------- 铁路的显示规则与连续性（v2.9） ----------
  // 地铁线、主要走隧道的线路（规划中的城际等）不算地图上的铁路，地面图只有这些线路的地面段
  const NOT_RAIL = /地铁|轨道交通|轻轨|轻铁|metro|subway|mrt|lrt/i, railInfo = new WeakMap();
  const lineLen = function (p) { let L = 0; for (let i = 0; i + 3 < p.length; i += 2) L += Math.hypot(p[i + 2] - p[i], p[i + 3] - p[i + 1]); return L; };
  function undergroundNames(rail) {
    let S = railInfo.get(rail); if (S) return S;
    const all = new Map(), tun = new Map();
    for (const r of rail) { const L = lineLen(r.p), n = r.name || ''; all.set(n, (all.get(n) || 0) + L); if (r.flags & 2) tun.set(n, (tun.get(n) || 0) + L); }
    S = new Set(); all.forEach(function (L, n) { if (n && (tun.get(n) || 0) > 0.6 * L) S.add(n); });
    railInfo.set(rail, S); return S;
  }
  Geo.railIsMetro = function (r) { return NOT_RAIL.test(r.name || ''); };
  Geo.railShown = function (r) { return r.p.length >= 4 && !NOT_RAIL.test(r.name || '') && (r.dated || !(r.name && undergroundNames(Geo.rail).has(r.name))); };   // 写了通车年份的隧道线（如高铁）通车后要显示
  // 线路自己的开通年份优先。只有未标年份的高铁才用地图的统一年份。
  Geo.railOpenYear = function (r) { return r.year || ((r.flags & 16) ? (CM.DATA.hsrYear || 2009) : 0); };
  // 连接段：地面图和图层都不画隧道，线路在隧道、有盖路段和很短的数据缺口处会断开。这里找出「地面段—隧道链—地面段」和相距很近的同线路断头，
  // 生成连接段（字段与 Geo.rail 相同，只用于显示，不影响步行阻隔和模拟）。隧道链不超过 3.5 km（JOIN_MAX 格），长隧道标记 dash 画虚线
  const JOIN_TOL = 0.06, JOIN_MAX = 14, GAP_MAX = 1.6, joinCache = new WeakMap();
  Geo.resetRailJoins = function () { if (Geo.rail) joinCache.delete(Geo.rail); };
  Geo.railJoins = function () {
    const rail = Geo.rail || []; let J = joinCache.get(rail); if (J) return J;
    J = [];
    const surf = [], tun = [], W = CM.CFG.W, H = CM.CFG.H, CM_M = CM.CFG.CELL_M;
    const under = undergroundNames(rail), whole = [];   // 写了年份、主要走隧道的线路：隧道段整段显示，不用再找接续
    for (const r of rail) if (Geo.railShown(r)) (r.flags & 2 ? (r.dated && under.has(r.name) ? whole : tun) : surf).push(r);
    const G = new Map(), ends = new Map(), put = function (m, k, v) { let a = m.get(k); if (!a) m.set(k, a = []); a.push(v); }, key = function (x, y) { return Math.floor(x) * 100000 + Math.floor(y); };
    for (const r of surf) for (let i = 0; i + 3 < r.p.length; i += 2) {
      const n = Math.max(1, Math.ceil(Math.hypot(r.p[i + 2] - r.p[i], r.p[i + 3] - r.p[i + 1]))), seen = new Set();
      for (let q = 0; q <= n; q++) { const k = key(r.p[i] + (r.p[i + 2] - r.p[i]) * q / n, r.p[i + 1] + (r.p[i + 3] - r.p[i + 1]) * q / n); if (!seen.has(k)) { seen.add(k); put(G, k, [r.p[i], r.p[i + 1], r.p[i + 2], r.p[i + 3], r]); } }
    }
    tun.forEach(function (t) { const n = t.p.length; put(ends, key(t.p[0], t.p[1]), [t, false]); put(ends, key(t.p[n - 2], t.p[n - 1]), [t, true]); });
    const around = function (m, x, y, fn) { const cx = Math.floor(x), cy = Math.floor(y); for (let a = cx - 1; a <= cx + 1; a++) for (let b = cy - 1; b <= cy + 1; b++) { const L = m.get(a * 100000 + b); if (L) for (const v of L) if (fn(v) === true) return; } };
    // (x, y) 附近的另一条地面铁路（skip 除外）
    const touch = function (x, y, skip) { let hit = null; around(G, x, y, function (s) { if (s[4] !== skip && CM.U.distToSeg(x, y, s[0], s[1], s[2], s[3]) <= JOIN_TOL) { hit = s[4]; return true; } }); return hit; };
    // 沿 (dx, dy) 方向约 110 m 处有没有地面铁路（双线铁路的两条股道挨得很近，只看端点会把并行股道当成接上了）
    const ahead = function (x, y, dx, dy, skip) {
      const L = Math.hypot(dx, dy) || 1, px = x + dx / L * 0.45, py = y + dy / L * 0.45; let hit = null;
      around(G, px, py, function (s) { if (s[4] !== skip && CM.U.distToSeg(px, py, s[0], s[1], s[2], s[3]) <= 0.14) { hit = s[4]; return true; } });
      return hit;
    };
    // 从地面段的断头沿隧道走，找到最短能回到地面铁路的隧道链
    const idx = new Map(tun.map(function (t, i) { return [t, i]; })), lens = tun.map(function (t) { return lineLen(t.p); });
    const walk = function (x0, y0, r0) {
      // 按里程从短到长展开（每段隧道每个方向只走一次），隧道很密的城市也不会变慢
      const open = [{ x: x0, y: y0, len: 0, prev: null, e: null }], done = new Set();
      while (open.length) {
        let bi = 0; for (let i = 1; i < open.length; i++) if (open[i].len < open[bi].len) bi = i;
        const cur = open[bi]; open[bi] = open[open.length - 1]; open.pop();
        if (cur.e) {
          // 隧道出口前方要有继续往前的地面铁路，只是挨着并行的另一条股道不算走出隧道
          const t = cur.e[0].p, m = t.length, ax = cur.e[1] ? t[0] - t[2] : t[m - 2] - t[m - 4], ay = cur.e[1] ? t[1] - t[3] : t[m - 1] - t[m - 3];
          const o = ahead(cur.x, cur.y, ax, ay, r0);
          if (o) { const parts = []; for (let q = cur; q.e; q = q.prev) parts.unshift(q.e); return { len: cur.len, parts: parts, end: o }; }
        }
        around(ends, cur.x, cur.y, function (e) {
          const t = e[0], rev = e[1], n = t.p.length, i = idx.get(t), k = i * 2 + (rev ? 1 : 0);
          if (done.has(k)) return;
          const sx = rev ? t.p[n - 2] : t.p[0], sy = rev ? t.p[n - 1] : t.p[1]; if (Math.hypot(sx - cur.x, sy - cur.y) > JOIN_TOL) return;
          const nl = cur.len + lens[i]; if (nl > JOIN_MAX) return;
          done.add(k);
          open.push({ x: rev ? t.p[0] : t.p[n - 2], y: rev ? t.p[1] : t.p[n - 1], len: nl, prev: cur, e: e });
        });
      }
      return null;
    };
    const make = function (p, src, dash) {
      let hsr = 0, year = 0;
      for (const r of src) {
        if (r.flags & 16) hsr = 16;
        year = Math.max(year, Geo.railOpenYear(r));
      }
      const m = lineLen(p) * CM_M, named = src.find(function (r) { return r.name; });
      let close = 0; for (const r of src) if (r.close && (!close || r.close < close)) close = r.close;
      J.push({ name: named ? named.name : '', flags: hsr, p: p, bbox: bboxOf(p), year: year, close: close, m: m, dash: dash || m > 350, join: true });
    };
    for (const t of whole) make(t.p, [t], true);
    const seen = new Set(), free = [];
    for (const r of surf) for (const atEnd of [false, true]) {
      const n = r.p.length, x = atEnd ? r.p[n - 2] : r.p[0], y = atEnd ? r.p[n - 1] : r.p[1], dx = atEnd ? x - r.p[n - 4] : x - r.p[2], dy = atEnd ? y - r.p[n - 3] : y - r.p[3];
      if (x < 0.3 || y < 0.3 || x > W - 0.3 || y > H - 0.3 || ahead(x, y, dx, dy, r)) continue;   // 到了地图边缘，或前方还有地面铁路
      const b = walk(x, y, r);
      if (!b) { if (!touch(x, y, r)) free.push({ x: x, y: y, r: r, dx: dx, dy: dy }); continue; }
      const id = b.parts.map(function (e) { return idx.get(e[0]); }).sort(function (a, c) { return a - c; }).join('-');
      if (seen.has(id)) continue; seen.add(id);
      const p = [x, y]; for (const e of b.parts) { const t = e[0].p, m = t.length; if (e[1]) for (let i = m - 2; i >= 0; i -= 2) p.push(t[i], t[i + 1]); else for (let i = 0; i < m; i += 2) p.push(t[i], t[i + 1]); }
      make(p, [r, b.end].concat(b.parts.map(function (e) { return e[0]; })));
    }
    // 很短的数据缺口：同名（或都没有名字）、方向接得上的两个断头直接连起来
    const paired = new Set();
    for (const a of free) {
      if (paired.has(a)) continue;
      let best = null, bd = GAP_MAX;
      for (const c of free) {
        if (c === a || paired.has(c) || c.r === a.r || c.r.name !== a.r.name) continue;
        const vx = c.x - a.x, vy = c.y - a.y, d = Math.hypot(vx, vy); if (d >= bd || d < 1e-6) continue;
        if ((vx * a.dx + vy * a.dy) / d / (Math.hypot(a.dx, a.dy) || 1) < 0.5 || -(vx * c.dx + vy * c.dy) / d / (Math.hypot(c.dx, c.dy) || 1) < 0.5) continue;
        bd = d; best = c;
      }
      if (best) { paired.add(a); paired.add(best); make([a.x, a.y, best.x, best.y], [a.r, best.r]); }
    }
    joinCache.set(rail, J);
    return J;
  };
  // 在画布上描出要素路径
  Geo.tracePoly = function (ctx, f) {
    for (const r of f.rings) { const p = r.p; ctx.moveTo(p[0], p[1]); for (let k = 2; k < p.length; k += 2) ctx.lineTo(p[k], p[k + 1]); ctx.lineTo(p[0], p[1]); }
  };
  Geo.traceLine = function (ctx, p) { ctx.moveTo(p[0], p[1]); for (let k = 2; k < p.length; k += 2) ctx.lineTo(p[k], p[k + 1]); };
})(window.CM);
