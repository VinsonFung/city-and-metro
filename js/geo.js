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
  // 在画布上描出要素路径
  Geo.tracePoly = function (ctx, f) {
    for (const r of f.rings) { const p = r.p; ctx.moveTo(p[0], p[1]); for (let k = 2; k < p.length; k += 2) ctx.lineTo(p[k], p[k + 1]); ctx.lineTo(p[0], p[1]); }
  };
  Geo.traceLine = function (ctx, p) { ctx.moveTo(p[0], p[1]); for (let k = 2; k < p.length; k += 2) ctx.lineTo(p[k], p[k + 1]); };
})(window.CM);
