'use strict';
// 背景交通线路（v2.9，通用机制「铁路与渡轮走廊」）：DATA.bg.lines 按真实线路声明普通铁路与渡轮——车站、走向（path，增量编码）、开停年月（y0 / y1）、
// 平均速度（km/h，含停站）、平均班次间隔（head，分钟，可为年份曲线）与票价类别（kind：rail / ferry，票价见 DATA.bg.fares）。
// 这些线路不归玩家经营，也不占道路。方式选择时，起终点附近有车站的出行可以改乘它们：步行或短途接驳到站、候车、乘车、换乘、票价合计为广义时间，
// 与开车按 Logit 分担（最多 bg.maxShare）；地铁再与「开车 + 背景交通」的混合成本比较。所以铁路和渡轮沿线的出行本来就有不错的选择，
// 地铁在这些走廊上要更快、更直接或更便宜才争得到乘客，在它们覆盖不到的地方潜力更大。
// 站到站的最短路只在主线程计算（每次交通刷新按当时的年份与时间价值重算，线路开停时立即刷新），方式选择线程只查表，结果与线程数无关。
(function (CM) {
  const U = CM.U, INF = 1e30, KA = 3;
  const BgNet = { KA: KA };
  CM.BgNet = BgNet;
  const yof = function (v) { return Array.isArray(v) ? v[0] + ((v[1] || 1) - 1) / 12 : v; };
  BgNet.yearOf = yof;
  // 线路来源（v2.9 通用机制）：写了 DATA.bg.lines 的地图用真实线路；没写 DATA.bg 的地图把地图上标注的铁路车站和码头串成线路（autoLines），同样进入方式选择，只是班次、速度用通用值；
  // 写了 DATA.bg.share 全市比重的地图不分线路，比重在全城平均分走客流，这时返回 null，图层只显示线路、车站和接驳关系
  BgNet.lines = function () { const D = CM.DATA; if (!D) return null; const B = D.bg; if (B && B.lines && B.lines.length) return B.lines; return B ? null : autoLines(D); };
  BgNet.active = function (L, t) { return (L.y0 == null || t >= yof(L.y0) - 1e-6) && (L.y1 == null || t < yof(L.y1) - 1e-6); };
  // 当年运营中的线路（比较这串字符就知道线网有没有变）
  BgNet.keyAt = function (t) { const ls = BgNet.lines(); if (!ls) return ''; let s = ''; for (const L of ls) s += BgNet.active(L, t) ? '1' : '0'; return s; };
  const headAt = function (L, t) { return Array.isArray(L.head) ? U.interp(L.head, t) : (L.head || 15); };

  // 站点：各线路的车站按名称合并（同名且相距 600 m 以内即同一座，可以换乘）。编号与年份无关，存档与求解数组长度不随线路开停变化
  const hubCache = new WeakMap();
  BgNet.hubs = function (ls) {
    ls = ls || BgNet.lines(); if (!ls) return null;
    let H = hubCache.get(ls); if (H) return H;
    const hubs = [], lineStops = [], lineGeo = [];
    ls.forEach(function (L) {
      const ids = [];
      for (const s of L.stops) {
        let k = -1; for (let i = 0; i < hubs.length; i++) if (hubs[i].name === s[0] && U.dist(hubs[i].x, hubs[i].y, s[1], s[2]) < 2.4) { k = i; break; }
        if (k < 0) { k = hubs.length; hubs.push({ name: s[0], x: s[1], y: s[2], lines: [], kinds: 0 }); }
        const h = hubs[k]; if (h.lines.indexOf(L) < 0) h.lines.push(L); h.kinds |= L.kind === 'ferry' ? 2 : 1;
        ids.push(k);
      }
      lineStops.push(ids);
      lineGeo.push(geoOf(L));
    });
    H = { hubs: hubs, lineStops: lineStops, lineGeo: lineGeo, NB: hubs.length };
    hubCache.set(ls, H); return H;
  };
  BgNet.size = function () { const H = BgNet.hubs(); return H ? H.NB : 0; };
  // 线路走向：有 path 时沿走向量车站之间的里程，没有时按直线 × 1.15
  function geoOf(L) {
    const raw = L.path && CM.Geo && CM.Geo.dec ? CM.Geo.dec(L.path) : null, pts = L.pts ? L.pts.map(function (p) { return [p[0], p[1]]; }) : [];
    if (raw && raw.length >= 4) for (let i = 0; i + 1 < raw.length; i += 2) pts.push([raw[i], raw[i + 1]]);
    const along = [];
    if (pts.length >= 2) {
      const cum = U.cumLen(pts);
      for (const s of L.stops) {
        let best = 1e18, at = 0;
        for (let i = 0; i + 1 < pts.length; i++) {
          const a = pts[i], b = pts[i + 1], dx = b[0] - a[0], dy = b[1] - a[1], LL = dx * dx + dy * dy || 1e-9, t = U.clamp(((s[1] - a[0]) * dx + (s[2] - a[1]) * dy) / LL, 0, 1);
          const x = a[0] + t * dx, y = a[1] + t * dy, d = (x - s[1]) * (x - s[1]) + (y - s[2]) * (y - s[2]);
          if (d < best) { best = d; at = cum[i] + t * Math.sqrt(LL); }
        }
        along.push(at);
      }
      return { pts: pts, cum: cum, along: along };
    }
    const p2 = L.stops.map(function (s) { return [s[1], s[2]]; });
    return { pts: p2, cum: U.cumLen(p2), along: null };
  }
  const segKm = function (G, L, j) {
    const a = L.stops[j], b = L.stops[j + 1], cell = CM.CFG.CELL_M / 1000;
    if (G.along) { const d = Math.abs(G.along[j + 1] - G.along[j]); if (d > 0.05) return d * cell; }
    return U.dist(a[1], a[2], b[1], b[2]) * cell * (L.kind === 'ferry' ? 1.2 : 1.15);
  };

  // 构建：t 年运营中的线路组成的网络，站到站的广义时间（含首次候车与票价）、实际时间、渡轮占乘车时间的比例、乘车里程与路径（供日汇总回溯）
  BgNet.build = function (t, prm) {
    const ls = BgNet.lines(); if (!ls) return null;
    const H = BgNet.hubs(ls), NB = H.NB, B = CM.DATA.bg || AUTO_BG;
    const nodeLine = [], nodeStop = [], nodeHub = [], lineBase = [];
    for (let k = 0; k < NB; k++) { nodeLine.push(-1); nodeStop.push(-1); nodeHub.push(k); }
    const act = ls.map(function (L) { return BgNet.active(L, t); });
    ls.forEach(function (L, li) { lineBase.push(nodeLine.length); if (!act[li]) return; H.lineStops[li].forEach(function (k, j) { nodeLine.push(li); nodeStop.push(j); nodeHub.push(k); }); });
    const nn = nodeLine.length, adj = []; for (let v = 0; v < nn; v++) adj.push([]);
    const waitCap = B.waitCap || 12, dwell = { rail: 0.5, ferry: 1 };
    ls.forEach(function (L, li) {
      if (!act[li]) return;
      // 候车：班次密时按半个班次；班次稀疏时乘客按时刻表到站，取 3 分钟 + 班次的两成（最多 waitCap）
      const hd = headAt(L, t), base = lineBase[li], ids = H.lineStops[li], G = H.lineGeo[li], w = Math.min(hd / 2, 3 + hd * 0.2, waitCap), v = L.speed || (L.kind === 'ferry' ? 18 : 40);
      for (let j = 0; j < ids.length; j++) {
        adj[ids[j]].push([base + j, prm.waitW * w + prm.tpen, w, 0, 0, 0]);   // 上车：候车 + 换乘惩罚（第一次上车的惩罚在最后扣回）
        adj[base + j].push([ids[j], 0, 0, 0, 0, 0]);                          // 下车
        if (j + 1 < ids.length) {
          const km = segKm(G, L, j), m = km / v * 60 + (dwell[L.kind] || 0.5), ferry = L.kind === 'ferry' ? m : 0;
          adj[base + j].push([base + j + 1, m, m, ferry, km, m]); adj[base + j + 1].push([base + j, m, m, ferry, km, m]);
        }
      }
    });
    const vot = prm.vot > 0 ? prm.vot : 1, fares = B.fares || {};
    const fRail = fares.rail ? U.interp(fares.rail, t) / vot * 60 : (prm.bgFare || 0) / vot * 60, fFerry = fares.ferry ? U.interp(fares.ferry, t) / vot * 60 : fRail;   // 没写票价时按地铁起步价
    const Gt = new Float32Array(NB * NB).fill(INF), At = new Float32Array(NB * NB), Ff = new Float32Array(NB * NB), KM = new Float32Array(NB * NB), pred = new Int32Array(NB * nn).fill(-1);
    const dist = new Float64Array(nn), dA = new Float64Array(nn), dF = new Float64Array(nn), dK = new Float64Array(nn), dR = new Float64Array(nn), done = new Uint8Array(nn);
    for (let s = 0; s < NB; s++) {
      if (!H.hubs[s].lines.some(function (L) { return act[ls.indexOf(L)]; })) continue;
      dist.fill(INF); done.fill(0); dist[s] = 0; dA[s] = 0; dF[s] = 0; dK[s] = 0; dR[s] = 0;
      const pb = s * nn;
      // 小图（几百个节点）：线性选点的 Dijkstra，顺序固定、结果确定
      for (;;) {
        let u = -1, du = INF;
        for (let v = 0; v < nn; v++) if (!done[v] && dist[v] < du) { du = dist[v]; u = v; }
        if (u < 0) break;
        done[u] = 1;
        for (const e of adj[u]) { const v = e[0], nd = du + e[1]; if (nd < dist[v] - 1e-9) { dist[v] = nd; dA[v] = dA[u] + e[2]; dF[v] = dF[u] + e[3]; dK[v] = dK[u] + e[4]; dR[v] = dR[u] + e[5]; pred[pb + v] = u; } }
      }
      for (let q = 0; q < NB; q++) {
        if (q === s || dist[q] >= INF || !(dK[q] > 0)) continue;
        Gt[s * NB + q] = dist[q] - prm.tpen + (dF[q] > 0 ? fFerry : fRail);
        At[s * NB + q] = dA[q]; Ff[s * NB + q] = dR[q] > 0 ? U.clamp(dF[q] / dR[q], 0, 1) : 0; KM[s * NB + q] = dK[q];
      }
    }
    return { t: t, NB: NB, nn: nn, G: Gt, A: At, F: Ff, KM: KM, pred: pred, nodeLine: Int16Array.from(nodeLine), nodeStop: Int16Array.from(nodeStop), nodeHub: Int32Array.from(nodeHub), act: act, max: B.maxShare != null ? B.maxShare : 0.9 };
  };

  // 小区到站：步行（直线 × 1.3，1.2 km 内）或短途接驳（公交、停车换乘，5 km 内，按候车 5 分钟、18 km/h、广义时间 ×1.4）；取广义时间最短的 3 个车站
  BgNet.access = function (model, net, prm) {
    const Z = model.Z, fn = model.fn, H = BgNet.hubs(), NB = H.NB, cell = CM.CFG.CELL_M / 1000;
    const zs = new Int16Array(Z * KA).fill(-1), zg = new Float32Array(Z * KA), zt = new Float32Array(Z * KA);
    const live = new Uint8Array(NB), ls = BgNet.lines();
    ls.forEach(function (L, li) { if (net.act[li]) for (const k of H.lineStops[li]) live[k] = 1; });
    const mpm = (CM.CFG.walk && CM.CFG.walk.mPerMin) || 75, cand = [];
    for (let z = 0; z < Z; z++) {
      const x = fn.nx[z], y = fn.ny[z]; cand.length = 0;
      for (let k = 0; k < NB; k++) {
        if (!live[k]) continue;
        const h = H.hubs[k], km = U.dist(x, y, h.x, h.y) * cell * 1.3;
        if (km > 5) continue;
        let t, gq;
        if (km <= 1.2) { t = km * 1000 / mpm; gq = prm.walkW * t; }
        else { t = 5 + km / 18 * 60; gq = t * 1.4; if (h.kinds === 2 && km > 3) continue; }
        cand.push([gq, t, k]);
      }
      cand.sort(function (a, b) { return a[0] - b[0] || a[2] - b[2]; });
      for (let i = 0; i < KA && i < cand.length; i++) { zs[z * KA + i] = cand[i][2]; zg[z * KA + i] = cand[i][0]; zt[z * KA + i] = cand[i][1]; }
    }
    return { zs: zs, zg: zg, zt: zt };
  };
  // 模型当前年份的网络（交通刷新时年份变化才重算；小区布局变化时重算接驳）
  BgNet.forModel = function (model, prm) {
    if (!BgNet.lines() || !model.fn) return null;
    const fares = CM.DATA.bg && CM.DATA.bg.fares;
    const bgFare = !(fares && fares.rail) && model.fareFor ? model.fareFor(0) : 0;
    const key = (CM.mapId || '') + ':' + model.year + ':' + (prm.vot || 0).toFixed(4) + ':' + model.Z + ':' + bgFare;
    const c = model._bgNet;
    if (c && c.key === key && c.fnKey === model.fn.key) return c;
    const net = BgNet.build(model.year, Object.assign({}, prm, { bgFare: bgFare })); if (!net) return null;
    const a = BgNet.access(model, net, prm);
    net.zs = a.zs; net.zg = a.zg; net.zt = a.zt; net.key = key; net.fnKey = model.fn.key;
    model._bgNet = net;
    return net;
  };

  // 日汇总：各小区出发的铁路 / 渡轮出行、各线路上车人数与断面最大客流（按站到站需求沿最短路回溯）
  BgNet.daily = function (model) {
    const net = model._bgNet, ls = BgNet.lines(); if (!net || !ls) return null;
    const H = BgNet.hubs(ls), NB = net.NB, nn = net.nn, Z = model.Z, W = CM.CFG.trips.weekWeights;
    const one = function (per) {
      const o = { zR: new Float32Array(Z), zF: new Float32Array(Z), trips: new Float32Array(Z), board: new Float32Array(ls.length), pkm: new Float32Array(ls.length), seg: ls.map(function (L) { return new Float32Array(Math.max(1, L.stops.length - 1)); }), hub: new Float32Array(NB), total: 0, ferry: 0, ready: true };
      const pair = new Float64Array(NB * NB);
      for (let p = 0; p < per.length; p++) {
        const P = per[p], h = model.pHours[p];
        if (!P || !P.stats || !P.bgDS || P.bgDS.length !== NB * NB || !P.zBgR || P.zBgR.length !== Z) { o.ready = false; continue; }
        for (let z = 0; z < Z; z++) { o.zR[z] += P.zBgR[z] * h; o.zF[z] += P.zBgF[z] * h; o.trips[z] += P.zTrips[z] * h; }
        for (let i = 0; i < NB * NB; i++) if (P.bgDS[i] > 0) pair[i] += P.bgDS[i] * h;
      }
      for (let s = 0; s < NB; s++) for (let q = 0; q < NB; q++) {
        const d = pair[s * NB + q]; if (!(d > 0)) continue;
        o.total += d; o.hub[s] += d; o.ferry += d * net.F[s * NB + q];
        let v = q, guard = 0;
        while (v !== s && v >= 0 && guard++ < 400) {
          const u = net.pred[s * nn + v]; if (u < 0) break;
          const lu = net.nodeLine[u], lv = net.nodeLine[v];
          if (lu >= 0 && lu === lv) { const j = Math.min(net.nodeStop[u], net.nodeStop[v]); o.seg[lu][j] += d; o.pkm[lu] += d * segKm(H.lineGeo[lu], ls[lu], j); }
          else if (lu < 0 && lv >= 0) o.board[lv] += d;
          v = u;
        }
      }
      return o;
    };
    const wd = one(model.ctxs.wd.per), we = one(model.ctxs.we.per);
    const mix = function (a, b) { if (a instanceof Float32Array) { const r = new Float32Array(a.length); for (let i = 0; i < a.length; i++) r[i] = a[i] * W.wd + b[i] * W.we; return r; } return a * W.wd + b * W.we; };
    const avg = { zR: mix(wd.zR, we.zR), zF: mix(wd.zF, we.zF), trips: mix(wd.trips, we.trips), board: mix(wd.board, we.board), pkm: mix(wd.pkm, we.pkm), seg: wd.seg.map(function (a, i) { return mix(a, we.seg[i]); }), hub: mix(wd.hub, we.hub), total: mix(wd.total, we.total), ferry: mix(wd.ferry, we.ferry), ready: wd.ready && we.ready };
    return { wd: wd, we: we, avg: avg, t: net.t, act: net.act.slice() };
  };

  // 旧存档只保存了周平均基准，切换日型时没有可比数据。
  BgNet.baseline = function (g, dt) {
    const base = g.bgBase;
    if (!base) return null;
    return dt === 'wd' || dt === 'we' ? base[dt] || null : base;
  };

  // 各线路的现状（图层与详情用）：dt 为 wd / we / avg
  BgNet.lineStats = function (g, dt) {
    const ls = BgNet.lines(); if (!ls || !g) return null;
    const m = g.model, d = m.bgDaily && m.bgDaily[dt || 'avg'], t = g.year(), base = BgNet.baseline(g, dt);
    return ls.map(function (L, i) {
      const on = BgNet.active(L, t), riders = d && d.ready && on ? d.board[i] : null, b0 = base && base.lines ? base.lines[L.id] : null;
      const mx = d && d.ready && on ? Math.max.apply(null, Array.from(d.seg[i])) : 0;
      return { L: L, i: i, on: on, riders: riders, pkm: d && d.ready && on ? d.pkm[i] : null, maxSeg: mx, base: b0, change: riders != null && b0 && b0.v > 0 ? riders / b0.v - 1 : null };
    });
  };
  // 记录对比基准：每条线路第一次有客流时的日乘客数（开局或开通当月），之后对比可以看出地铁吸引了多少铁路、渡轮乘客
  BgNet.noteBase = function (g) {
    const ls = BgNet.lines(), daily = g.model.bgDaily;
    if (!ls || !daily || !daily.avg.ready) return;
    const ym = g.ym(), year = g.year();
    if (!g.bgBase) g.bgBase = { lines: {}, ym: ym, wd: { lines: {}, ym: ym }, we: { lines: {}, ym: ym } };
    for (const dt of ['avg', 'wd', 'we']) {
      const base = BgNet.baseline(g, dt), d = daily[dt];
      if (!base || !d.ready) continue;
      if (base.total == null && d.total > 0) { base.total = d.total; base.ferry = d.ferry; base.ym = ym; }
      ls.forEach(function (L, i) {
        if (!base.lines[L.id] && d.board[i] > 0 && BgNet.active(L, year)) base.lines[L.id] = { v: d.board[i], ym: ym };
      });
    }
  };

  // ---------- 通用数据：地图上真实存在的铁路、车站和码头（v2.9） ----------
  // 只显示地图上画出来的：铁路与地面图同一条规则（隧道段不画、没到开通年份不算），地铁线不算，主要走隧道的线路（规划中的城际等）整条不算；
  // 车站只取地图上有标注和模型的（铁路设施、铁路地标）；渡轮只有两端都标注了码头才算（DATA.bgViz.ferries 的 piers，或真实线路的车站）。新地图写好地面数据就自动适用
  const AUTO_BG = { maxShare: 0.5, waitCap: 12 };
  // 铁路画成地图上通用的黑白相间线、车站画方块，渡轮是蓝色虚线、码头画菱形，和地铁的彩色实线、圆形车站一眼分开（线路之间不再分色）
  const RAIL_INK = '#4b5563', RAIL_INK_N = '#aab6c6', HSR_INK = '#9b3a32', HSR_INK_N = '#d98a80', FERRY_INK = '#2f8fbf', LINK_GREEN = '#1f9d63';
  BgNet.railCss = function (hsr) { const c = hsr ? HSR_INK : RAIL_INK; return { background: 'repeating-linear-gradient(90deg,' + c + ' 0 4px,#ffffff 4px 8px)', boxShadow: 'inset 0 0 0 1px ' + c }; };
  function railStroke(ctx, w, hsr, night, halo) {
    ctx.lineCap = 'butt'; ctx.setLineDash([]);
    ctx.strokeStyle = halo; ctx.lineWidth = w + 2; ctx.stroke();
    ctx.strokeStyle = hsr ? (night ? HSR_INK_N : HSR_INK) : (night ? RAIL_INK_N : RAIL_INK); ctx.lineWidth = w; ctx.stroke();
    const gap = Math.max(4, w * 2.6); ctx.setLineDash([gap, gap]); ctx.strokeStyle = night ? '#1b2533' : '#ffffff'; ctx.lineWidth = Math.max(1, w - 1.4); ctx.stroke();
    ctx.setLineDash([]); ctx.lineCap = 'round';
  }
  const thin = function (p, gap) { const out = [p[0], p[1]]; for (let i = 2; i + 1 < p.length - 2; i += 2) if (Math.abs(p[i] - out[out.length - 2]) + Math.abs(p[i + 1] - out[out.length - 1]) >= gap) out.push(p[i], p[i + 1]); out.push(p[p.length - 2], p[p.length - 1]); return out; };
  const lenOf = function (p) { let L = 0; for (let i = 0; i + 3 < p.length; i += 2) L += U.dist(p[i], p[i + 1], p[i + 2], p[i + 3]); return L; };
  const surfaceCache = new WeakMap(), NO_RAIL = [];
  function surfaceRail(D) {
    const ck = (CM.Geo && CM.Geo.rail) || NO_RAIL; let S = surfaceCache.get(ck); if (S) return S;
    S = ((CM.Geo && CM.Geo.rail) || []).filter(function (r) { return !(r.flags & 2) && CM.Geo.railShown(r); }).concat(CM.Geo ? CM.Geo.railJoins() : []);   // 连接段让线路不在隧道处断开
    surfaceCache.set(ck, S); return S;
  }
  // 标注的主要车站：铁路设施和铁路地标
  function majorStations(D) {
    const out = [], push = function (name, x, y, y0, y1) { for (const s of out) if (U.dist(s.x, s.y, x, y) < 0.8) return; out.push({ name: name, x: x, y: y, y0: y0, y1: y1, major: true }); };
    (D.landmarks || []).forEach(function (lm) { if (lm.kind === 'rail') push(lm.name, lm.x, lm.y, lm.year == null ? -1e9 : lm.year, null); });
    if (CM.Fac) for (const f of CM.Fac.list()) if (f.t === 'rail' && !f.ext) push(CM.Fac.shortName(f), f.x, f.y, f.open, f.close);
    return out;
  }
  function segGrid(ways) {
    const G = new Map();
    for (const w of ways) for (let i = 0; i + 3 < w.p.length; i += 2) {
      const n = Math.max(1, Math.ceil(U.dist(w.p[i], w.p[i + 1], w.p[i + 2], w.p[i + 3]))), seen = new Set();
      for (let q = 0; q <= n; q++) { const k = Math.floor(w.p[i] + (w.p[i + 2] - w.p[i]) * q / n) * 100000 + Math.floor(w.p[i + 1] + (w.p[i + 3] - w.p[i + 1]) * q / n); if (seen.has(k)) continue; seen.add(k); let a = G.get(k); if (!a) G.set(k, a = []); a.push([w.p[i], w.p[i + 1], w.p[i + 2], w.p[i + 3], w.L]); }
    }
    return G;
  }
  // 点附近（默认约 150 m）经过的线路
  function linesNear(G, x, y, R) {
    const out = new Set(), cx = Math.floor(x), cy = Math.floor(y);
    for (let i = cx - 1; i <= cx + 1; i++) for (let j = cy - 1; j <= cy + 1; j++) { const a = G.get(i * 100000 + j); if (a) for (const s of a) if (U.distToSeg(x, y, s[0], s[1], s[2], s[3]) <= R) out.add(s[4]); }
    return out;
  }
  // 地图上的铁路与车站可能在年中开停，按月缓存。
  const monthKey = function (t) { return CM.mapId + ':' + Math.floor(t * 12 + 1e-6); };
  let autoCache = null;
  BgNet.auto = function (t) {
    const D = CM.DATA, key = monthKey(t);
    if (autoCache && autoCache.key === key && autoCache.src === D) return autoCache;
    const byName = new Map();
    for (const r of surfaceRail(D)) {
      if (!CM.City.railActiveAt(r, t)) continue;
      const name = r.name || '';
      let L = byName.get(name);
      if (!L) byName.set(name, L = { name: name, hsr: false, km: 0, near: [], far: [] });
      if (r.flags & 16) L.hsr = true;
      L.km += lenOf(r.p) * CM.CFG.CELL_M / 1000;
      L.near.push(thin(r.p, 0.12)); L.far.push(thin(r.p, 0.7));
    }
    const rail = Array.from(byName.values()).sort(function (a, b) { return (a.name ? 1 : 0) - (b.name ? 1 : 0) || a.km - b.km; });   // 无名线路先画，有名线路压在上面
    // 枢纽设施里也有不通铁路的（如公路口岸），约 300 m 内要有铁路（隧道段也算，大中央这样的地下车站不能漏）才算铁路站
    const onRail = function (s) { for (const r of (CM.Geo && CM.Geo.rail) || []) { const b = r.bbox; if (s.x < b[0] - 1.2 || s.x > b[2] + 1.2 || s.y < b[1] - 1.2 || s.y > b[3] + 1.2 || CM.Geo.railIsMetro(r) || !CM.City.railActiveAt(r, t)) continue; for (let i = 0; i + 3 < r.p.length; i += 2) if (U.distToSeg(s.x, s.y, r.p[i], r.p[i + 1], r.p[i + 2], r.p[i + 3]) <= 1.2) return true; } return false; };
    const stations = majorStations(D).filter(function (s) { return t >= s.y0 && (s.y1 == null || t < s.y1) && onRail(s); });
    return (autoCache = { key: key, src: D, rail: rail, stations: stations, named: rail.filter(function (L) { return L.name; }).sort(function (a, b) { return b.km - a.km; }), km: rail.reduce(function (s, L) { return s + L.km; }, 0) });
  };
  // 没写 DATA.bg 的地图：把标注的主要车站沿同名铁路两两串起来（高铁不算，它和市内通勤几乎不竞争），加上标注了码头的渡轮航线
  const linesCache = new WeakMap();
  function autoLines(D) {
    const ck = (CM.Geo && CM.Geo.rail) || NO_RAIL; if (linesCache.has(ck)) return linesCache.get(ck);   // CM.DATA 切换地图时是同一个对象，缓存要按各图自己的铁路数据
    const out = [], byName = new Map();
    for (const r of surfaceRail(D)) { if (!r.name || (r.flags & 16)) continue; let a = byName.get(r.name); if (!a) byName.set(r.name, a = []); a.push(r); }
    const major = majorStations(D);
    byName.forEach(function (ways, name) {
      const G = segGrid(ways.map(function (r) { return { p: r.p, L: 1 }; }));
      const st = major.filter(function (s) { return linesNear(G, s.x, s.y, 0.8).size; });
      if (st.length < 2) return;
      // 沿线路主方向排序（线路大致是直的，够用）
      let cx = 0, cy = 0; for (const s of st) { cx += s.x; cy += s.y; } cx /= st.length; cy /= st.length;
      let xx = 0, xy = 0, yy = 0; for (const s of st) { const dx = s.x - cx, dy = s.y - cy; xx += dx * dx; xy += dx * dy; yy += dy * dy; }
      const ang = 0.5 * Math.atan2(2 * xy, xx - yy), ux = Math.cos(ang), uy = Math.sin(ang);
      st.sort(function (a, b) { return (a.x * ux + a.y * uy) - (b.x * ux + b.y * uy); });
      for (let i = 0; i + 1 < st.length; i++) {
        const a = st[i], b2 = st[i + 1]; if (U.dist(a.x, a.y, b2.x, b2.y) < 2) continue;
        out.push({ id: 'auto_r_' + name + '_' + i, kind: 'rail', name: name, speed: 45, head: 30, y0: Math.max(a.y0, b2.y0), y1: a.y1 != null || b2.y1 != null ? Math.min(a.y1 != null ? a.y1 : 9999, b2.y1 != null ? b2.y1 : 9999) : null, stops: [[a.name, a.x, a.y], [b2.name, b2.x, b2.y]] });
      }
    });
    ((D.bgViz && D.bgViz.ferries) || []).forEach(function (f, i) {
      if (!f.piers || f.pts.length < 2) return;
      const p0 = f.pts[0], p1 = f.pts[f.pts.length - 1];
      out.push({ id: 'auto_f_' + i, kind: 'ferry', name: f.name, color: '#2f8fbf', speed: 15, head: 20, y0: f.from != null ? f.from : -1e9, y1: f.to != null ? f.to : null, stops: [[f.piers[0], p0[0], p0[1]], [f.piers[1], p1[0], p1[1]]], pts: f.pts });
    });
    const res = out.length ? out : null;
    if (res) res.auto = true;
    linesCache.set(ck, res); return res;
  }
  // 某年运营的渡轮：只有标注了码头的航线（真实线路的车站、或 DATA.bgViz.ferries 的 piers）
  BgNet.ferries = function (t, visual) {
    const D = CM.DATA, ls = BgNet.lines();
    if (ls && !ls.auto) { const H = BgNet.hubs(ls); return ls.map(function (L, i) { return { L: L, i: i }; }).filter(function (e) { return e.L.kind === 'ferry' && BgNet.active(e.L, t); }).map(function (e) { return { name: e.L.name, color: e.L.color, pts: H.lineGeo[e.i].pts, piers: e.L.stops.map(function (s) { return [s[0], s[1], s[2]]; }) }; }); }
    const transit = CM.BgTransit, snapped = new Map((transit && transit.city === CM.game?.city ? transit.ferries : []).map(f => [f.f.name, f.r.pts]));
    // 手写的航线年份包含停运年。只在地图显示时按整年读取，客流接驳沿用原来的口径。
    const year = visual ? Math.floor(t) : t;
    return ((D.bgViz && D.bgViz.ferries) || []).filter(function (f) { return f.piers && (f.from == null || year >= f.from) && (f.to == null || year <= f.to); }).map(function (f) { const p0 = f.pts[0], p1 = f.pts[f.pts.length - 1]; return { name: f.name, color: f.color && f.color !== '#f4f1e8' && f.color !== '#f2ede0' && f.color !== '#e8eef4' ? f.color : '#2f8fbf', pts: snapped.get(f.name) || f.pts, piers: [[f.piers[0], p0[0], p0[1]], [f.piers[1], p1[0], p1[1]]] }; });
  };
  // 码头标签和地铁换乘取当年的岸上位置，船停在近旁水面。
  const shoreline = new WeakMap();
  BgNet.shore = function (city, x, y) {
    if (!city) return { land: [x, y], dock: [x, y] };
    let cache = shoreline.get(city);
    if (!cache || cache.version !== city.terrainVer) {
      cache = { version: city.terrainVer, points: new Map() };
      shoreline.set(city, cache);
    }
    const key = x + ',' + y, prior = cache.points.get(key);
    if (prior) return prior;
    const result = { land: [x, y], dock: [x, y] }, wet = !!city.waterAt(x, y);
    const max = wet ? 2.5 : 0.6;
    search: for (let r = 0.04; r <= max; r += 0.04) {
      for (let i = 0; i < 32; i++) {
        const a = i * Math.PI / 16, dx = Math.cos(a), dy = Math.sin(a), px = x + dx * r, py = y + dy * r;
        if (city.cellAt(px, py) < 0 || !!city.waterAt(px, py) === wet) continue;
        if (wet) result.land = [px, py];
        const step = wet ? -0.04 : 0.04, bx = px + step * dx, by = py + step * dy;
        if (city.waterAt(bx, by)) result.dock = [bx, by];
        else if (!wet) result.dock = [px, py];
        break search;
      }
    }
    cache.points.set(key, result);
    return result;
  };
  // 某年运营的码头，同名合并。传入城市后取当年的岸上位置。
  BgNet.piers = function (t, city, visual = !!city) {
    const out = [], seen = [];
    for (const f of BgNet.ferries(t, visual)) for (const [name, x, y] of f.piers) {
      if (seen.some(p => p.name === name && U.dist(p.x, p.y, x, y) < 2.4)) continue;
      seen.push({ name, x, y });
      const [px, py] = BgNet.shore(city, x, y).land;
      out.push({ name, x: px, y: py });
    }
    return out;
  };

  // ---------- 竞争与互补（v2.9，通用机制） ----------
  // 竞争：铁路、渡轮沿线的居民本来就有选择（方式选择里与开车按 Logit 分担；不分线路的地图按全市比重）。
  // 互补：地铁站约 400 m 内有运营中的铁路站或码头时可以换乘，这座地铁站的吸引力更高，更多人来这里坐地铁（接驳的感知步行时间缩短，主要车站更多）。
  const LINK_M = 400;
  BgNet.LINK_M = LINK_M;
  const stopCache = new WeakMap();
  BgNet.stops = function (t, city) {
    if (city.mapId && city.mapId !== CM.mapId) return [];
    const D = CM.DATA, key = monthKey(t), cached = stopCache.get(city);
    if (cached && cached.key === key && cached.src === D && cached.terrain === city.terrainVer) return cached.list;
    // 只有地图上显示的站点：铁路设施、铁路地标和标注的码头。真实线路上其余车站只进入客流模型，不显示、不算接驳
    const out = [];
    for (const s of BgNet.auto(t).stations) out.push({ name: s.name, x: s.x, y: s.y, kind: 'rail', q: 1 });
    for (const p of BgNet.piers(t, city, false)) out.push({ ...p, kind: 'ferry', q: 0.6 });
    stopCache.set(city, { key: key, src: D, terrain: city.terrainVer, list: out });
    return out;
  };
  // 各地铁站的接驳：bonus 为感知步行时间的减少（分钟）。一座地铁站接最近的一个站点
  BgNet.links = function (t, C, city) {
    const stops = BgNet.stops(t, city), N = C.stations.length, bonus = new Float32Array(N), list = [], cell = CM.CFG.CELL_M, R = LINK_M / cell;
    if (!stops.length) return null;
    for (let s = 0; s < N; s++) {
      if (C.serviced && !C.serviced[s]) continue;
      const st = C.stations[s]; let best = null, bd = Infinity;
      for (const p of stops) { const d = U.dist(st.x, st.y, p.x, p.y); if (d <= R && d < bd) { bd = d; best = p; } }
      if (!best) continue;
      const b = (1.5 + 2 * best.q) * (1 - 0.5 * bd / R);
      bonus[s] = b; list.push({ s: s, stop: best, m: Math.round(bd * cell), b: b, st: st });
    }
    return { bonus: bonus, list: list };
  };
  const stopKey = p => p.kind + ':' + p.x + ',' + p.y + ':' + p.name;
  // 图层用的接驳统计：互补带来的上车人次按 Logit 弹性估算（与不接驳相比）
  BgNet.linkStats = function (g, kind) {
    const m = g.model, acc = m.net && m.net.acc, L = acc && acc.bgLinks, sd = m.stDaily;
    const stops = BgNet.stops(g.year(), g.city).filter(p => p.kind === kind), active = new Set(stops.map(stopKey));
    const c = CM.CFG, sh = m.dailyWk && m.dailyWk.metroShare ? m.dailyWk.metroShare : 0.15, th = c.choice.theta, ww = c.choice.walkW;
    const items = [], done = new Set(); let gain = 0;
    if (L && m.net.C && m.net.C.stations.length === L.bonus.length) for (const e of L.list) {
      const key = stopKey(e.stop);
      if (!active.has(key)) continue;
      const inn = sd && !m.dailyStale && sd.inn ? sd.inn[e.s] || 0 : 0, u = 0.4 * (1 - Math.exp(-th * ww * e.b * (1 - sh))), add = inn * u;   // 0.4：换乘吸引只作用在这座站能到达的出行上，按实测（约为弹性值的两到四成）取偏保守的值
      items.push({ stop: e.stop, st: e.st, m: e.m, add: add }); gain += add; done.add(key);
    }
    items.sort(function (a, b) { return b.add - a.add; });
    return { total: stops.length, linked: done.size, gain: gain, items: items, done: done };
  };
  function drawAuto(ctx, R, kind, P, halo, night) {
    const g = R.game, t = g.year(), zw = U.clamp(R.z * 0.05, 1, 3.2), far = R.z < 10, rad = Math.hypot(R.w, R.h) / R.z * (R.cam.view > 0.5 ? 2.4 : 1.1), cx = R.cam.cx, cy = R.cam.cy;
    const stroke = function (w, col, dash) { ctx.setLineDash(dash || []); ctx.strokeStyle = halo; ctx.lineWidth = w + 3; ctx.stroke(); ctx.strokeStyle = col; ctx.lineWidth = w; ctx.stroke(); ctx.setLineDash([]); };
    ctx.globalAlpha = 0.95;
    if (kind === 'ferry') {
      for (const f of BgNet.ferries(t, true)) {
        ctx.beginPath(); f.pts.forEach(function (p, i) { const q = P(p[0], p[1]); if (i) ctx.lineTo(q[0], q[1]); else ctx.moveTo(q[0], q[1]); });
        stroke(2.2 * zw, FERRY_INK, [6, 5]);
      }
      return;
    }
    const net = BgNet.auto(t);
    for (const L of net.rail) {
      ctx.beginPath();
      for (const p of far ? L.far : L.near) {
        if (!far && Math.abs(p[0] - cx) > rad && Math.abs(p[p.length - 2] - cx) > rad) continue;
        if (!far && Math.abs(p[1] - cy) > rad && Math.abs(p[p.length - 1] - cy) > rad) continue;
        let q = P(p[0], p[1]); ctx.moveTo(q[0], q[1]);
        for (let i = 2; i + 1 < p.length; i += 2) { q = P(p[i], p[i + 1]); ctx.lineTo(q[0], q[1]); }
      }
      railStroke(ctx, Math.min(3.6, (L.hsr ? 2.6 : L.name ? 2.2 : 1.8) * zw), L.hsr, night, halo);
    }
  }
  // 车站、码头与接驳关系（所有地图同一画法）：已接驳的画绿色实心并连到地铁站，放大后写带来的客流；没接驳的是空心点
  function drawStops(ctx, R, kind, P, halo, night) {
    const g = R.game, zw = U.clamp(R.z * 0.05, 1, 1.6), G = LINK_GREEN, LS = BgNet.linkStats(g, kind), showName = R.z >= 14;
    ctx.globalAlpha = 1; ctx.font = '600 11px system-ui, "Microsoft YaHei", sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    for (const e of LS.items) {
      const a = P(e.stop.x, e.stop.y), b = P(e.st.x, e.st.y);
      ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.setLineDash([4, 3]); ctx.lineWidth = 2 * zw; ctx.strokeStyle = G; ctx.stroke(); ctx.setLineDash([]);
      ctx.beginPath(); ctx.arc(b[0], b[1], 5 * zw, 0, Math.PI * 2); ctx.lineWidth = 2; ctx.strokeStyle = G; ctx.stroke();
    }
    const stops = kind === 'ferry' ? BgNet.piers(g.year(), g.city).map(p => ({ ...p, kind: 'ferry', q: 0.6 })) : BgNet.stops(g.year(), g.city);
    for (const p of stops) {
      if (p.kind !== kind) continue;
      const q = P(p.x, p.y); if (q[0] < -20 || q[1] < -20 || q[0] > R.w + 20 || q[1] > R.h + 20) continue;
      const on = LS.done.has(stopKey(p)), r = (p.q >= 1 ? 4 : 3) * zw;
      ctx.beginPath();
      if (kind === 'ferry') { const d = r * 1.3; ctx.moveTo(q[0], q[1] - d); ctx.lineTo(q[0] + d, q[1]); ctx.lineTo(q[0], q[1] + d); ctx.lineTo(q[0] - d, q[1]); ctx.closePath(); }
      else ctx.rect(q[0] - r, q[1] - r, r * 2, r * 2);
      ctx.fillStyle = on ? G : (night ? '#1b2533' : '#ffffff'); ctx.fill();
      ctx.lineWidth = 1.8; ctx.strokeStyle = on ? (night ? '#d8f5e6' : '#ffffff') : (kind === 'ferry' ? FERRY_INK : (night ? RAIL_INK_N : RAIL_INK)); ctx.stroke();
      if (showName) { ctx.lineWidth = 3; ctx.strokeStyle = halo; ctx.strokeText(p.name, q[0] + r + 3, q[1]); ctx.fillStyle = night ? '#d8e2ee' : '#2a3442'; ctx.fillText(p.name, q[0] + r + 3, q[1]); }
    }
    if (R.z >= 12) for (const e of LS.items) {
      if (e.add < 50) continue;
      const q = P(e.st.x, e.st.y), txt = '换乘 +' + U.fmtPeople(Math.round(e.add));
      ctx.lineWidth = 3; ctx.strokeStyle = halo; ctx.strokeText(txt, q[0] + 8, q[1] + 11); ctx.fillStyle = G; ctx.fillText(txt, q[0] + 8, q[1] + 11);
    }
  }

  // ---------- 图层绘制（2D 画布，三维视图同样按投影画在上层） ----------
  // kind：rail / ferry。有线路数据时按客流画粗细；没有时画自动生成的线路与车站（BgNet.auto）
  BgNet.draw = function (ctx, R, kind) {
    const g = R.game; if (!g) return;
    const ls = BgNet.lines(), t = g.year(), tmp = {}, P = function (x, y) { const p = R.P(x, y, 0, tmp); return [p.x, p.y]; };
    const night = R.themeName === 'dark', halo = night ? 'rgba(14,20,30,0.85)' : 'rgba(255,255,255,0.92)';
    ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    const poly = function (pts, w, col, dash, alpha) {
      if (pts.length < 2) return;
      ctx.beginPath(); let q = P(pts[0][0], pts[0][1]); ctx.moveTo(q[0], q[1]);
      for (let i = 1; i < pts.length; i++) { q = P(pts[i][0], pts[i][1]); ctx.lineTo(q[0], q[1]); }
      ctx.globalAlpha = alpha == null ? 1 : alpha; ctx.setLineDash(dash || []);
      ctx.strokeStyle = halo; ctx.lineWidth = w + 3; ctx.stroke();
      ctx.strokeStyle = col; ctx.lineWidth = w; ctx.stroke(); ctx.setLineDash([]);
    };
    if (!ls || ls.auto) { drawAuto(ctx, R, kind, P, halo, night); drawStops(ctx, R, kind, P, halo, night); ctx.restore(); return; }
    const H = BgNet.hubs(ls), st = BgNet.lineStats(g, R.layerOpt.bgDt || 'avg') || [];
    let mx = 1; for (const s of st) if (s.L.kind === kind && s.maxSeg > mx) mx = s.maxSeg;
    const zw = U.clamp(R.z * 0.05, 1, 3.2);
    // 停运、未开通的线路画淡色虚线，运营中的按断面客流画粗细
    for (const s of st) {
      if (s.L.kind !== kind) continue;
      const G = H.lineGeo[s.i];
      if (!s.on) { poly(G.pts, 1.6 * zw, kind === 'ferry' ? FERRY_INK : (night ? RAIL_INK_N : RAIL_INK), [5, 5], 0.4); continue; }
      const segs = BgNet.segPts(H, s.i);
      for (let j = 0; j < segs.length; j++) {
        const v = s.maxSeg > 0 && g.model.bgDaily ? (g.model.bgDaily[R.layerOpt.bgDt || 'avg'].seg[s.i][j] || 0) : 0, w = Math.min(9, (2 + 7 * Math.sqrt(v / mx)) * zw / 1.6);
        if (kind === 'ferry') {
          const pair = G.along && G.along[j] > G.along[j + 1] ? [s.L.stops[j + 1], s.L.stops[j]] : [s.L.stops[j], s.L.stops[j + 1]];
          const [a, b] = pair.map(p => BgNet.shore(g.city, p[1], p[2]).dock);
          poly([a, ...segs[j], b], w, FERRY_INK, [Math.max(6, w * 2), Math.max(5, w * 1.6)], 0.95); continue;
        }
        if (segs[j].length < 2) continue;
        ctx.globalAlpha = 0.95; ctx.beginPath(); let q = P(segs[j][0][0], segs[j][0][1]); ctx.moveTo(q[0], q[1]);
        for (let i = 1; i < segs[j].length; i++) { q = P(segs[j][i][0], segs[j][i][1]); ctx.lineTo(q[0], q[1]); }
        railStroke(ctx, w, false, night, halo);
      }
    }
    drawStops(ctx, R, kind, P, halo, night);
    ctx.restore();
  };
  // 一条线路按车站切成的各段折线（沿走向）
  BgNet.segPts = function (H, li) {
    const G = H.lineGeo[li], L = BgNet.lines()[li], out = [];
    if (!G.along) { for (let j = 0; j + 1 < L.stops.length; j++) out.push([[L.stops[j][1], L.stops[j][2]], [L.stops[j + 1][1], L.stops[j + 1][2]]]); return out; }
    if (G._segs) return G._segs;
    for (let j = 0; j + 1 < L.stops.length; j++) {
      const a = Math.min(G.along[j], G.along[j + 1]), b = Math.max(G.along[j], G.along[j + 1]), pts = [], q = {};
      U.posAt(G.pts, G.cum, a, q); pts.push([q.x, q.y]);
      for (let i = 0; i < G.pts.length; i++) if (G.cum[i] > a && G.cum[i] < b) pts.push(G.pts[i]);
      U.posAt(G.pts, G.cum, b, q); pts.push([q.x, q.y]);
      out.push(pts);
    }
    G._segs = out; return out;
  };
})(window.CM);
