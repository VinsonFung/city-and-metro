'use strict';
// 线网成长回放（v2.7）：在线路图里按时间重放线网从第一条线到现在的成长。
// 固定线路图版面；历史站点补在相邻车站旁，新线沿线路方向逐段长出。
// 用画布绘制（线路多时比逐个改 SVG 元素流畅），线宽、站标、配色与静态线路图相同，最后一帧与静态图位置一致。
(function (CM) {
  const U = CM.U, M = CM.Metro, h = U.h, AX = CM.Accessibility;
  const SN = 22;   // 每段路线的取样点数
  let A = null, S = null, preparing = null;

  const timeOf = function (b, fb) { return b ? b[0] + (b[1] - 1) / 12 : fb; };
  const ease = function (x) { x = U.clamp(x, 0, 1); return x * x * (3 - 2 * x); };
  const clockT = function (g) { return g.clock.y + (g.clock.m - 1) / 12; };

  // 时代：有历史阶段的地图用阶段起点，否则用发展阶段表
  function eraList() {
    const D = CM.DATA, out = [];
    if (D.eras && D.eras.length) for (const e of D.eras) out.push({ from: e.from, name: e.name });
    else { let from = -Infinity; for (const s of D.stages || []) { out.push({ from: from, name: s[1] }); from = s[0]; } if (D.stageLast) out.push({ from: from, name: D.stageLast }); }
    return out;
  }
  function eraAt(list, t) { let cur = null; for (const e of list) if (t >= e.from) cur = e; return cur; }

  // 全部历史：现存的 + 已拆除的。区段改归过线路（贯通、拆开、拆出支线，见 game.js 的 lh）时按时间拆成几段，各段画成当时所属线路的颜色
  function collect(g) {
    const net = g.net, gone = g.netGone || { stations: {}, segments: {}, lines: {} }, T1 = clockT(g);
    let T0 = T1;
    const stations = {}, segs = [], lines = {};
    for (const id in gone.lines) lines[id] = gone.lines[id];
    for (const id in net.lines) lines[id] = net.lines[id];
    for (const id in gone.stations) stations[id] = gone.stations[id];
    for (const id in net.stations) {
      const s = net.stations[id], former = gone.stations[id];
      stations[id] = M.isVirt(s) && former && !M.isVirt(former) ? { ...former, virtualAfter: s } : s;
    }
    const add = function (s, t1) {
      if (!stations[s.a] || !stations[s.b]) return;
      const t0 = timeOf(s.replayFrom || s.built, CM.CFG.START.y); if (t0 < T0) T0 = t0;
      const cuts = (s.lh || []).map(function (c) { return { t: timeOf(c, t0), line: c[2] }; });
      let from = t0;
      cuts.concat([{ t: t1, line: s.line, last: true }]).forEach(function (c, k) {
        const L = cuts[k] ? cuts[k].line : s.line, to = c.last ? t1 : Math.max(from, c.t);
        if (to > from + 1e-6 && lines[L]) {
          const id = cuts.length ? s.id + '~' + k : s.id;
          const track = cuts.length ? Object.assign({}, s, { id: id, line: L }) : s;
          segs.push({ s: track, id: id, base: s.id, line: L, a: s.a, b: s.b, t0: from, t1: to, relabel: k > 0, rewired: k === 0 && !!s.replayFrom });
        }
        from = to;
      });
    };
    for (const id in gone.segments) if (!net.segments[id]) add(gone.segments[id], timeOf(gone.segments[id].gone, Infinity));
    for (const id in net.segments) add(net.segments[id], Infinity);
    // 本月也要完整播放；否则本月新建的区段要到进度 100% 才开始生长。
    return { stations: stations, segs: segs, lines: lines, T0: T0, now: T1, T1: T1 + 1 / 12 };
  }
  // 某一时刻的线网（只读，用来排版）
  function subnet(H, t) {
    const n = { stations: {}, segments: {}, lines: {} };
    const at = function (sid) {
      const s = H.stations[sid];
      return s.virtualAfter && timeOf(s.gone, Infinity) <= t + 1e-6 ? s.virtualAfter : s;
    };
    for (const x of H.segs) if (x.t0 <= t + 1e-6 && t < x.t1) { n.segments[x.id] = x.s; n.stations[x.a] = at(x.a); n.stations[x.b] = at(x.b); n.lines[x.line] = H.lines[x.line]; }
    return n;
  }
  function resample(pts) {
    const out = new Float32Array(SN * 2), n = pts.length;
    if (n < 2) { const p = pts[0] || [0, 0]; for (let k = 0; k < SN; k++) { out[2 * k] = p[0]; out[2 * k + 1] = p[1]; } return out; }
    let total = 0; const acc = [0];
    for (let i = 1; i < n; i++) { total += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); acc.push(total); }
    let j = 1;
    for (let k = 0; k < SN; k++) {
      const d = total * k / (SN - 1);
      while (j < n - 1 && acc[j] < d) j++;
      const seg = acc[j] - acc[j - 1] || 1, t = (d - acc[j - 1]) / seg;
      out[2 * k] = pts[j - 1][0] + (pts[j][0] - pts[j - 1][0]) * t; out[2 * k + 1] = pts[j - 1][1] + (pts[j][1] - pts[j - 1][1]) * t;
    }
    return out;
  }
  function frameOf(g, H, t) {
    const net = subnet(H, t), F = { t: t, pos: new Map(), hub: new Map(), route: new Map(), n: Object.keys(net.segments).length, real: [], virt: [] };
    if (!F.n) return F;
    M.withSegIndex([net], function () {
      const R = A.computeRoutes(g, net, [], A.spacing());
      F.real = R.lay.st.slice();   // 这一帧真正排了版的车站（江海底图按它们和线路交叉点变形）
      F.virt = (R.base.virt || []).map(function (v) { return { g: v.g, p: [v.p[0] + R.base.ox, v.p[1] + R.base.oy] }; });
      F.magnify = R.base.warp || null;
      R.lay.st.forEach(function (sid, i) { const p = R.positions[i], anch = R.stationAnchors.get(sid), G = A.hubGeom(p[0], p[1], anch); F.pos.set(sid, [p[0], p[1]]); F.hub.set(sid, G); });
      for (const tr of R.tracks) F.route.set(tr.seg.id, resample(tr.screen));
    });
    return F;
  }
  // 简洁示意的固定版面。
  // 现在和地理线网一样只用一份版面：现在线网的排版（与静态线路图一致），已拆除的车站按相邻车站的地理方向和本图的比例补位
  function placeGone(H, F) {
    const geo = function (sid) { const s = H.stations[sid]; return s ? [s.x, s.y] : null; };
    const rs = [];
    for (const x of H.segs) { const pa = F.pos.get(x.a), pb = F.pos.get(x.b), ga = geo(x.a), gb = geo(x.b); if (!pa || !pb || !ga || !gb) continue; const d = Math.hypot(ga[0] - gb[0], ga[1] - gb[1]); if (d > 0.2) rs.push(Math.hypot(pa[0] - pb[0], pa[1] - pb[1]) / d); }
    rs.sort(function (a, b) { return a - b; });
    const k = rs.length ? rs[rs.length >> 1] : 40;
    const adj = new Map(), link = function (a, b) { let l = adj.get(a); if (!l) adj.set(a, l = []); l.push(b); };
    for (const x of H.segs) { link(x.a, x.b); link(x.b, x.a); }
    let todo = Array.from(adj.keys()).filter(function (sid) { return !F.pos.has(sid) && geo(sid); });
    // 沿已拆除的区段一圈一圈往外补：先补紧挨着现存车站的，再补它们的邻站
    for (let pass = 0; todo.length && pass < 60; pass++) {
      const next = [];
      for (const sid of todo) {
        const g0 = geo(sid), ref = (adj.get(sid) || []).find(function (o) { return F.pos.has(o) && geo(o); });
        if (!ref) { next.push(sid); continue; }
        const p = F.pos.get(ref), gr = geo(ref); F.pos.set(sid, [p[0] + (g0[0] - gr[0]) * k, p[1] + (g0[1] - gr[1]) * k]);
      }
      if (next.length === todo.length) break;
      todo = next;
    }
    // 和现在线网完全不连通的（整条线都拆了）：挂到地理上最近的已定位车站
    for (const sid of todo) {
      const g0 = geo(sid); let best = null, bd = Infinity;
      F.pos.forEach(function (p, o) { const go = geo(o); if (!go) return; const d = Math.hypot(go[0] - g0[0], go[1] - g0[1]); if (d < bd) { bd = d; best = o; } });
      if (best) { const p = F.pos.get(best), gb = geo(best); F.pos.set(sid, [p[0] + (g0[0] - gb[0]) * k, p[1] + (g0[1] - gb[1]) * k]); }
    }
    // 区段：同一条轨道的其他时期（贯通、拆开前后）沿用现在的走向；已拆除的画直线
    const byBase = new Map(); for (const x of H.segs) { const r = F.route.get(x.id); if (r && !byBase.has(x.base)) byBase.set(x.base, r); }
    for (const x of H.segs) {
      if (F.route.has(x.id)) continue;
      const r0 = byBase.get(x.base); if (r0) { F.route.set(x.id, r0); continue; }
      const pa = F.pos.get(x.a), pb = F.pos.get(x.b); if (!pa || !pb) continue;
      const r = new Float32Array(SN * 2);
      for (let q = 0; q < SN; q++) { const t = q / (SN - 1); r[2 * q] = pa[0] + (pb[0] - pa[0]) * t; r[2 * q + 1] = pa[1] + (pb[1] - pa[1]) * t; }
      F.route.set(x.id, r);
    }
  }
  // 播放进度 ↔ 时间（v3.4 玩家反馈：以前上一条线还没画完就切到下一条）：按真实秒数排。每个镜头依次是「镜头到位约 1.1 秒 → 按里程生长 2.6–9 秒
  // → 长完停留约 1.4 秒」，下一个镜头在这个镜头全部结束后才开始；同一个月的几个镜头首尾相接，没有变化的月份约 0.06 秒一个月掠过。
  // 总时长就是这些秒数之和（最短 30 秒）；超过 10 分钟时整体压缩，但每个镜头最多压到一半
  const IDLE = 0.06, SHOT = { lead: 1.1, hold: 1.4 };
  function growSec(gp) { return gp.instant ? 0 : gp.kind === 'build' ? U.clamp(2.2 + gp.km * 0.28, 2.6, 9) : gp.kind === 'relabel' ? U.clamp(1.6 + gp.km * 0.16, 2, 5.5) : 1.6; }
  function groupSec(gp) { return gp.instant ? 0.4 : SHOT.lead + growSec(gp) + SHOT.hold; }
  // 成长回放的「镜头」（v3.4）：每次变化是一组——同一条线在同一个月的新建（开通、延伸、开通支线）、改归（贯通、拆开）或停运；
  // 一组一个镜头，镜头只跟这一条线。同一个月有几组时依次排开（新建在前、按线路顺序），不再几条线同时长出来；
  // 新线从一端按里程匀速长到另一端，延伸从原来的终点向外、支线从分叉的车站长出（与实际先接上既有车站、再向外修一致）；插站引起的少量替换不单独成镜头
  function changeGroups(H) {
    const groups = new Map(), byBase = new Map();
    for (const x of H.segs) { let l = byBase.get(x.base); if (!l) byBase.set(x.base, l = []); l.push(x); }
    const km = function (x) { const a = H.stations[x.a], b = H.stations[x.b]; return a && b ? Math.hypot(a.x - b.x, a.y - b.y) * CM.CFG.CELL_M / 1000 : 0; };
    const add = function (kind, line, t, x) {
      const k = kind + '|' + line + '|' + Math.round(t * 12);
      let gp = groups.get(k); if (!gp) groups.set(k, gp = { kind: kind, line: line, t: t, m: Math.round(t * 12), segs: [], km: 0 });
      gp.segs.push(x); gp.km += km(x);
    };
    const goneAt = new Set(), builtAt = new Set();
    for (const x of H.segs) {
      if (isFinite(x.t1)) goneAt.add(x.line + '|' + Math.round(x.t1 * 12));
      if (!x.relabel) builtAt.add(x.line + '|' + Math.round(x.t0 * 12));
      add(x.relabel ? 'relabel' : 'build', x.line, x.t0, x);
    }
    // 停运：区段消失、之后也没有改归到别的线路，同一个月同一条线也没有新区段接替（插站、改线不算停运）
    for (const x of H.segs) {
      if (!isFinite(x.t1)) continue;
      const ps = byBase.get(x.base); if (ps[ps.indexOf(x) + 1]) continue;
      if (builtAt.has(x.line + '|' + Math.round(x.t1 * 12))) continue;
      add('close', x.line, x.t1, x);
    }
    groups.forEach(function (gp) { gp.instant = gp.kind === 'build' && (gp.segs.every(x => x.rewired) || (goneAt.has(gp.line + '|' + gp.m) && gp.segs.length <= 3)); });
    return Array.from(groups.values());
  }
  const KIND_ORDER = { build: 0, relabel: 1, close: 2 };
  function timeWarp(H, G = changeGroups(H)) {
    // 当前月也要完整播放，才能画完当月新建的线网。末帧日期仍停在当前月。每个月的秒数是这个月各镜头的秒数之和
    const m0 = Math.round(H.T0 * 12), m1 = Math.round(H.T1 * 12), n = Math.max(1, m1 - m0), w = new Float64Array(n);
    for (const gp of G) { const k = U.clamp(gp.m - m0, 0, n - 1); w[k] += groupSec(gp); }
    for (let i = 0; i < n; i++) w[i] = w[i] || IDLE;
    const acc = new Float64Array(n + 1); for (let i = 0; i < n; i++) acc[i + 1] = acc[i] + w[i];
    const tot = acc[n] || 1;
    return {
      dur: tot > 600 ? Math.max(600, tot * 0.5) : Math.max(30, tot),
      t2p: function (t) { const f = U.clamp(t * 12 - m0, 0, n), i = Math.min(n - 1, Math.floor(f)); return (acc[i] + w[i] * (f - i)) / tot; },
      p2t: function (p) { const v = U.clamp(p, 0, 1) * tot; let lo = 0, hi = n; while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (acc[mid] <= v) lo = mid; else hi = mid; } return Math.min(H.now, (m0 + lo + (v - acc[lo]) / w[lo]) / 12); },
    };
  }
  // 排时间：每个月按各组的秒数切成几段，一组占一段（镜头到位 → 生长 → 停留）；组内沿线路方向按里程匀速生长。返回车站出现的进度与镜头清单
  function schedule(H, W, G = changeGroups(H)) {
    const lineOrd = M.sortIds(Object.keys(H.lines)), ord = function (l) { const i = lineOrd.indexOf(l); return i < 0 ? 999 : i; };
    const byMonth = new Map(); for (const gp of G) { let l = byMonth.get(gp.m); if (!l) byMonth.set(gp.m, l = []); l.push(gp); }
    const shots = [], byStation = new Map();
    for (const x of H.segs) for (const sid of [x.a, x.b]) {
      let edges = byStation.get(sid); if (!edges) byStation.set(sid, edges = []);
      edges.push(x);
    }
    // 同一条线此前已有的车站：延伸从原终点、支线从分叉站长出；新线即使经过别的线路的车站，也从一端开始（新线是整条开通的）
    const earlier = function (sid, t0, line) { for (const x of byStation.get(sid)) if (x.line === line && x.t0 < t0 - 1e-6 && x.t1 > t0) return true; return false; };
    const len = function (x) { const a = H.stations[x.a], b = H.stations[x.b]; return a && b ? Math.max(0.05, Math.hypot(a.x - b.x, a.y - b.y)) : 0.3; };
    // 改归时仍在运营、与这一组相接的别的区段（拆开后留在原线上的部分）
    const touch = function (sid, t0) { for (const x of byStation.get(sid)) if (x.t0 < t0 - 1e-6 && x.t1 > t0 + 1e-6) return true; return false; };
    byMonth.forEach(function (list, m) {
      list.sort(function (a, b) { return (KIND_ORDER[a.kind] - KIND_ORDER[b.kind]) || (ord(a.line) - ord(b.line)); });
      const P0 = W.t2p(m / 12), P1 = W.t2p((m + 1) / 12), span = Math.max(1e-6, P1 - P0), tw = list.reduce(function (s, gp) { return s + groupSec(gp); }, 0) || 1;
      let at = P0;
      for (const gp of list) {
        const sec = groupSec(gp), wl = span * sec / tw, k = wl / sec, w0 = at, g0 = gp.instant ? at : at + SHOT.lead * k, w1 = g0 + growSec(gp) * k; at += wl;
        gp.w0 = w0; gp.g0 = g0; gp.w1 = w1; gp.we = at;   // 镜头开始、开始生长、长完、镜头结束（之后才轮到下一个镜头）
        if (gp.kind === 'close') { for (const x of gp.segs) x.p1 = g0 + (w1 - g0) * 0.5; shots.push(gp); continue; }
        const segs = gp.segs;
        if (gp.instant) { for (const x of segs) { x.from = x.a; x.p0 = g0; x.gd = 0; } continue; }
        // 生长起点：接在既有线网上的车站（延伸、支线）；新线取一端
        const adj = new Map(); for (const x of segs) for (const sid of [x.a, x.b]) { let l = adj.get(sid); if (!l) adj.set(sid, l = []); l.push(x); }
        const starts = []; adj.forEach(function (l, sid) { if (earlier(sid, gp.t, gp.line)) starts.push(sid); });
        // 改归（v3.4，贯通、拆开、拆出支线）：贯通从两线相接的车站、拆开从与原线分开的车站起，新颜色沿线路铺过去，旧颜色等铺满再撤
        if (!starts.length && gp.kind === 'relabel') adj.forEach(function (l, sid) { if (touch(sid, gp.t)) starts.push(sid); });
        if (!starts.length) {
          adj.forEach(function (l, sid) { if (l.length === 1) starts.push(sid); });
          starts.sort(function (p, q) { const A = H.stations[p], B = H.stations[q]; return A && B ? (A.x - B.x) || (A.y - B.y) : 0; });
          starts.length = Math.min(1, starts.length); if (!starts.length) starts.push(segs[0].a);
        }
        gp.starts = starts;
        // 按里程排：起点距离 0，沿生长树累加区段长度；全组按最长的一支匀速长完
        const dist = new Map(), seen = new Set(), q = starts.slice(); for (const sid of starts) dist.set(sid, 0);
        for (let i = 0; i < q.length; i++) for (const x of adj.get(q[i]) || []) { if (seen.has(x)) continue; seen.add(x); x.from = q[i]; x._d0 = dist.get(q[i]); const o = x.a === q[i] ? x.b : x.a; if (!dist.has(o)) { dist.set(o, x._d0 + len(x)); q.push(o); } }
        for (const x of segs) if (!seen.has(x)) { x.from = x.a; x._d0 = 0; }
        const total = Math.max(1e-6, segs.reduce(function (mx, x) { return Math.max(mx, x._d0 + len(x)); }, 0)), sc = (w1 - g0) / total;
        for (const x of segs) { x.p0 = x.rewired ? g0 : g0 + x._d0 * sc; x.gd = x.rewired ? 0 : len(x) * sc; }
        shots.push(gp);
      }
    });
    // 区段结束的时刻接上接替它的那一组：改归（贯通、拆开）在换色的镜头开始时换，插站与改线在同一条线新区段开始生长时换，画面上不会断开
    const byBase = new Map(); for (const x of H.segs) { let l = byBase.get(x.base); if (!l) byBase.set(x.base, l = []); l.push(x); }
    const startOf = new Map(); for (const gp of G) if (gp.kind !== 'close' && gp.w0 != null) { const k = gp.line + '|' + gp.m; startOf.set(k, Math.min(startOf.has(k) ? startOf.get(k) : Infinity, gp.w0)); }
    for (const x of H.segs) {
      if (x.p1 != null) continue;
      if (!isFinite(x.t1)) { x.p1 = Infinity; continue; }
      const ps = byBase.get(x.base), nx = ps[ps.indexOf(x) + 1], k = x.line + '|' + Math.round(x.t1 * 12);
      x.p1 = nx && nx.p0 != null ? nx.p0 + (nx.relabel ? nx.gd || 0 : 0) : (startOf.has(k) ? startOf.get(k) : W.t2p(x.t1));
    }
    const st = new Map();
    // 虚拟节点不画站点
    for (const x of H.segs) {
      const a0 = x.from === x.b ? x.p0 + x.gd : x.p0, b0 = x.from === x.b ? x.p0 : x.p0 + x.gd;
      for (const e of [[x.a, a0], [x.b, b0]]) { if (H.stations[e[0]] && H.stations[e[0]].v) continue; let v = st.get(e[0]); if (!v) st.set(e[0], v = { p0: Infinity, p1: -Infinity, name: H.stations[e[0]].name }); v.p0 = Math.min(v.p0, e[1]); v.p1 = Math.max(v.p1, x.p1); }
    }
    shots.sort(function (a, b) { return a.w0 - b.w0; });
    return { st: st, shots: shots };
  }
  // 播报：线路开通、延伸、开通支线、贯通、拆开（拆出支线）、停运，按播放进度排好
  function newsList(H, W) {
    const out = [], first = new Map(), last = new Map(), byBase = new Map(), eps = 1e-6;
    for (const x of H.segs) {
      if (!first.has(x.line) || x.t0 < first.get(x.line)) first.set(x.line, x.t0);
      if (!last.has(x.line) || x.t1 > last.get(x.line)) last.set(x.line, x.t1);
      let l = byBase.get(x.base); if (!l) byBase.set(x.base, l = []); l.push(x);
    }
    const name = function (l) { return H.lines[l] ? H.lines[l].name : ''; }, push = function (t, text, l, kind = 'build') { out.push({ p: W.t2p(t) + 1e-4, text: text, line: l, month: Math.round(t * 12), kind: kind }); };
    // 某条线某一时刻之前的车站度数（判断是延伸还是开支线）
    const degBefore = function (l, sid, t) { let d = 0; for (const x of H.segs) if (x.line === l && x.t0 < t - eps && x.t1 >= t - eps && (x.a === sid || x.b === sid)) d++; return d; };
    first.forEach(function (t, l) {
      const born = H.segs.filter(function (x) { return x.line === l && Math.abs(x.t0 - t) < eps; });
      const src = born.filter(function (x) { return x.relabel; }).map(function (x) { const ps = byBase.get(x.base); return ps[ps.indexOf(x) - 1]; }).filter(Boolean);
      if (src.length && src.length >= born.length / 2) push(t, '从 ' + name(src[0].line) + ' 拆出 ' + name(l), l, 'relabel');
      else push(t, name(l) + ' 开通', l);
    });
    last.forEach(function (t, l) {
      if (!isFinite(t)) return;
      const ended = H.segs.filter(function (x) { return x.line === l && Math.abs(x.t1 - t) < eps; });
      const to = ended.map(function (x) { const ps = byBase.get(x.base); return ps[ps.indexOf(x) + 1]; }).filter(Boolean);
      if (to.length) push(t, name(l) + ' 与 ' + name(to[0].line) + ' 贯通', to[0].line, 'relabel'); else push(t, name(l) + ' 停运', l, 'close');
    });
    // 已有线路在之后的月份增加新区段：从中间车站分出去是开通支线，否则是延伸
    const grp = new Map();
    for (const x of H.segs) { if (x.relabel || x.rewired || x.t0 <= first.get(x.line) + eps) continue; const k = x.line + '|' + Math.round(x.t0 * 12); let l = grp.get(k); if (!l) grp.set(k, l = []); l.push(x); }
    grp.forEach(function (list) {
      const l = list[0].line, t = list[0].t0, ids = new Set(); for (const x of list) { ids.add(x.a); ids.add(x.b); }
      if (H.segs.some(function (x) { return x.line === l && Math.abs(x.t1 - t) < eps && !x.relabel; }) && list.length <= 3) return;   // 插站
      let branch = false, ext = false; ids.forEach(function (sid) { const d = degBefore(l, sid, t); if (d >= 2) branch = true; else if (d === 1) ext = true; });
      if (branch) push(t, name(l) + ' 开通支线', l); else if (ext) push(t, name(l) + ' 延伸', l);
    });
    // 拆开、贯通以外的部分改归（拆出支线时原线还在，已在「拆出」里报过）
    return out.sort(function (a, b) { return a.p - b.p; });
  }
  function prepare(g) {
    const H = collect(g), eras = eraList(), groups = changeGroups(H), W = timeWarp(H, groups), { st: stInfo, shots } = schedule(H, W, groups), news = newsList(H, W);
    const shotByChange = new Map(shots.map(q => [q.kind + '|' + q.line + '|' + q.m, q]));
    for (const e of news) { const shot = shotByChange.get(e.kind + '|' + e.line + '|' + e.month); if (shot) e.p = shot.w0; }
    news.sort((x, y) => x.p - y.p);
    const all = { stations: H.stations, segments: {}, lines: H.lines }; for (const x of H.segs) all.segments[x.id] = x.s;
    let F;
    if (A.geographic()) {
      // 地理线网：位置不变，只有一帧（已拆除的区段也算出位置）
      const base = M.withSegIndex([g.net, all], function () { const current = A.computeRoutes(g, g.net, [], A.spacing()); return current.N ? current : A.computeRoutes(g, all, [], A.spacing()); });
      if (!base.N) return null;
      F = { t: H.T1, pos: new Map(), hub: new Map(), route: new Map(), n: H.segs.length };
      for (const sid in H.stations) { const s = H.stations[sid], p = base.base(s.x, s.y); F.pos.set(sid, p); F.hub.set(sid, A.hubGeom(p[0], p[1], null)); }
      M.withSegIndex([all], function () { for (const x of H.segs) F.route.set(x.id, resample(base.base.path(M.segGeom(all, x.s, g.city).pts))); });
    } else {
      const baseTime = H.segs.some(function (x) { return !isFinite(x.t1); }) ? H.T1 : H.segs.reduce(function (t, x) { return Math.max(t, x.t0); }, H.T0);
      F = frameOf(g, H, baseTime);
      if (!F.n) return null;
      placeGone(H, F);
      const lenses = H.segs.map(function (x) { const a = H.stations[x.a], b = H.stations[x.b]; return Math.hypot(a.x - b.x, a.y - b.y); }).filter(function (v) { return v > 0; });
      const G = [], P = [];
      for (const sid of F.real) { const s = H.stations[sid]; G.push([s.x, s.y]); P.push(F.pos.get(sid)); }
      for (const v of F.virt) { G.push(v.g); P.push(v.p); }
      F.water = G.length >= 2 ? A.waterLayer(G, P, A.medianSpacing(lenses), F.magnify) : null;
    }
    let km = new Map(), kmOK = true;
    try {
      const C = g.compiled; if (C && C.segs) C.segs.forEach(function (cs) { if (cs.g) km.set(cs.seg.id, cs.g.lenM / 1000); });
      M.withSegIndex([all], function () { for (const x of H.segs) if (!km.has(x.base)) km.set(x.base, M.segGeom(all, x.s, g.city).lenM / 1000); });
    } catch (e) { kmOK = false; }
    return { H: H, eras: eras, W: W, stInfo: stInfo, shots, layout: F, km: km, kmOK: kmOK, news: news };
  }

  // ---------------- 绘制 ----------------
  function drawWater(c, wa, P) {
    if (!wa) return;
    const C = wa._path || (wa._path = (function () {
      const path = function (f, closed) { const q = new Path2D(); for (let k = 0; k + 1 < f.length; k += 2) { if (k) q.lineTo(f[k], f[k + 1]); else q.moveTo(f[k], f[k + 1]); } if (closed) q.closePath(); return q; };
      const polys = new Path2D(); for (const f of wa.polys) polys.addPath(path(f, true));
      return { edge: path(wa.edge, true), polys: polys, rivers: wa.rivers.map(function (r) { return { w: r.w, p: path(r.p, false) }; }) };
    })());
    c.save(); c.clip(C.edge);
    c.fillStyle = P.waterS || P.water; c.strokeStyle = P.waterS || P.water; c.lineJoin = 'round'; c.lineCap = 'round'; c.lineWidth = 4;
    c.fill(C.polys, 'evenodd'); c.stroke(C.polys);
    for (const r of C.rivers) { c.lineWidth = r.w; c.stroke(r.p); }
    c.restore();
  }
  const lineColor = function (L) { return AX.line(L); };
  function drawHub(c, x, y, r, cols, P) {
    c.fillStyle = P.ring; c.beginPath(); c.arc(x, y, r * 1.15, 0, 7); c.fill();
    c.fillStyle = P.disc; c.beginPath(); c.arc(x, y, r * 0.85, 0, 7); c.fill();
    ringSeg(c, x, y, r * 0.72, cols, r * 0.2, cols.length > 1 ? 0.22 : 0, 'butt');
    arrows(c, x, y, r * 0.36, P);
  }
  function ringSeg(c, x, y, R, cols, w, gap, cap) {
    c.lineWidth = w; c.lineCap = cap; const n = cols.length;
    if (n < 2) { c.strokeStyle = cols[0]; c.beginPath(); c.arc(x, y, R, 0, 7); c.stroke(); return; }
    for (let k = 0; k < n; k++) { c.strokeStyle = cols[k]; c.beginPath(); c.arc(x, y, R, -Math.PI / 2 + k * Math.PI * 2 / n + gap / 2, -Math.PI / 2 + (k + 1) * Math.PI * 2 / n - gap / 2); c.stroke(); }
    c.lineCap = 'round';
  }
  function arrows(c, x, y, gs, P) {
    const h0 = gs * 0.42, hd = gs * 0.52;
    c.strokeStyle = P.arrow; c.lineWidth = 1.7; c.lineCap = 'round'; c.lineJoin = 'round'; c.beginPath();
    c.moveTo(x - gs, y - h0); c.lineTo(x + gs, y - h0); c.lineTo(x + gs - hd, y - h0 - hd);
    c.moveTo(x + gs, y + h0); c.lineTo(x - gs, y + h0); c.lineTo(x - gs + hd, y + h0 + hd); c.stroke();
  }
  function shotAt(D, p) {
    const L = D.shots, gap = 1.6 / D.W.dur;
    for (let i = 0; i < L.length; i++) {
      const q = L[i];
      if (p < q.w0) return q.w0 - p < gap ? q : null;
      if (p < q.we) return q;
    }
    return null;
  }
  function paint(dt) {
    const D = S.D, cv = S.cv, c = S.ctx, host = A.canvas(); if (!host) return;
    const cw = host.clientWidth, ch = host.clientHeight, dpr = Math.min(2, window.devicePixelRatio || 1);
    if (!cw || !ch) return;
    if (cv.width !== Math.round(cw * dpr) || cv.height !== Math.round(ch * dpr)) { cv.width = Math.round(cw * dpr); cv.height = Math.round(ch * dpr); }
    const p = S.p, T = Math.min(D.H.now, D.W.p2t(p)), F = D.layout, P = S.P, H = D.H;
    const stationPos = function (sid) { return F.pos.get(sid); };
    // 可见区段和车站
    const vis = [], stLines = new Map();
    const stDir = new Map();
    for (const x of H.segs) {
      if (p < x.p0 || p >= x.p1) continue;
      const g = x.gd ? U.clamp((p - x.p0) / x.gd, 0, 1) : 1;
      vis.push({ x: x, g: g });
      // 车站处的线路走向：站名写在线路旁边，不压在线上
      const ra = F.route.get(x.id);
      if (ra) { const dx = ra[2] - ra[0], dy = ra[3] - ra[1]; if (!stDir.has(x.a)) stDir.set(x.a, [dx, dy]); if (!stDir.has(x.b)) stDir.set(x.b, [dx, dy]); }
      const reached = g >= 1;
      for (const e of [[x.a, x.from === x.a || reached], [x.b, x.from === x.b || reached]]) { if (!e[1]) continue; let l = stLines.get(e[0]); if (!l) stLines.set(e[0], l = []); if (l.indexOf(x.line) < 0) l.push(x.line); }
    }
    // 运镜（v3.4）：有变化时镜头只跟这一组（一条线），跟着生长的线头平移、逐渐收进整段新线，变化结束后稍作停留；
    // 两次变化之间退回能看见全部已建线网的远景。玩家拖动或缩放后不再自动运镜
    const V = A.view(), shot = shotAt(D, p);
    S.cameraMoving = false;
    if (S.follow && V) {
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      const addP = function (q) { if (!q) return; x0 = Math.min(x0, q[0]); x1 = Math.max(x1, q[0]); y0 = Math.min(y0, q[1]); y1 = Math.max(y1, q[1]); };
      if (shot) {
        for (const sid of shot.starts || []) addP(stationPos(sid));
        for (const x of shot.segs) {
          if (shot.kind !== 'close' && p < x.p0) continue;
          const from = x.from === x.b ? x.b : x.a, to = from === x.a ? x.b : x.a, gg = shot.kind !== 'close' && x.gd ? U.clamp((p - x.p0) / x.gd, 0, 1) : 1, A0 = stationPos(from), B0 = stationPos(to);
          addP(A0); if (A0 && B0) addP([A0[0] + (B0[0] - A0[0]) * gg, A0[1] + (B0[1] - A0[1]) * gg]);
        }
        if (x0 === Infinity) for (const x of shot.segs) { addP(stationPos(x.a)); break; }
      } else stLines.forEach(function (l, sid) { addP(stationPos(sid)); });
      if (x0 < Infinity) {
        const pad = shot ? 140 : 150, minW = shot ? 900 : 1200, bw = Math.max(minW, x1 - x0 + pad * 2), bh = Math.max(minW * ch / cw, y1 - y0 + pad * 2), sc = Math.min(cw / bw, Math.max(120, ch - 96) / bh), tw = cw / sc, th = ch / sc, tx = (x0 + x1) / 2 - tw / 2, ty = (y0 + y1) / 2 - th / 2 + 34 / sc;
        S.cameraMoving = !S.snap && Math.max(Math.abs(tx - V.x), Math.abs(ty - V.y), Math.abs(tw - V.w), Math.abs(th - V.h)) > tw * 0.0001;
        const k = S.snap || !S.cameraMoving || CM.Settings.reducedMotion() ? 1 : 1 - Math.exp(-dt * (shot ? 2.2 : 1.3));
        if (k === 1) S.cameraMoving = false;
        V.x += (tx - V.x) * k; V.y += (ty - V.y) * k; V.w += (tw - V.w) * k; V.h += (th - V.h) * k; S.snap = false;
        A.setView(S.cameraMoving);
      }
    }
    const sc = Math.min(cw / V.w, ch / V.h), ox = (cw - V.w * sc) / 2 - V.x * sc, oy = (ch - V.h * sc) / 2 - V.y * sc;
    c.setTransform(dpr, 0, 0, dpr, 0, 0); c.clearRect(0, 0, cw, ch);
    c.setTransform(dpr * sc, 0, 0, dpr * sc, dpr * ox, dpr * oy);
    const kz = Math.min(1, (cw / 1200) / sc);
    const geo = A.geographic(), LW = (geo ? 8.5 : 11) * kz;
    if (!geo) drawWater(c, F.water, P);
    // 路线
    const trace = function (o) {
      const pts = F.route.get(o.x.id), rev = o.x.from === o.x.b, last = o.g >= 1 ? SN - 1 : o.g * (SN - 1), n = Math.floor(last);
      if (!pts) return false;
      c.beginPath();
      if (!rev) { c.moveTo(pts[0], pts[1]); for (let k = 1; k <= n; k++) c.lineTo(pts[2 * k], pts[2 * k + 1]); if (n < SN - 1) { const f = last - n; c.lineTo(pts[2 * n] + (pts[2 * n + 2] - pts[2 * n]) * f, pts[2 * n + 1] + (pts[2 * n + 3] - pts[2 * n + 1]) * f); } }
      else { const e = SN - 1; c.moveTo(pts[2 * e], pts[2 * e + 1]); for (let k = 1; k <= n; k++) c.lineTo(pts[2 * (e - k)], pts[2 * (e - k) + 1]); if (n < e) { const f = last - n, i = e - n; c.lineTo(pts[2 * i] + (pts[2 * i - 2] - pts[2 * i]) * f, pts[2 * i + 1] + (pts[2 * i - 1] - pts[2 * i + 1]) * f); } }
      return true;
    };
    c.lineCap = 'round'; c.lineJoin = 'round';
    // 改归的旧色留在底下，直到新区段的颜色铺完。
    vis.sort((a, b) => Number(a.x.relabel) - Number(b.x.relabel));
    c.strokeStyle = P.casing; c.lineWidth = LW + 3 * kz;
    for (const o of vis) if (trace(o)) c.stroke();
    for (const o of vis) {
      if (!trace(o)) continue;
      c.globalAlpha = shot && S.follow && shot.line !== o.x.line ? 0.55 : 1;
      c.strokeStyle = lineColor(H.lines[o.x.line]); c.lineWidth = LW; c.setLineDash([]); c.stroke();
      const ty = o.x.s.type;
      if (ty === 'elevated') { c.strokeStyle = P.elev; c.lineWidth = 2.2; c.stroke(); }
      else if (ty === 'surface') { c.strokeStyle = P.elev; c.lineWidth = 3; c.setLineDash([2, 5]); c.lineCap = 'butt'; c.stroke(); c.setLineDash([]); c.lineCap = 'round'; }
    }
    c.globalAlpha = 1;
    // 改归的接点（v3.4）：新颜色开始铺开时，接点泛起两圈新线路颜色的光圈
    if (!CM.Settings.reducedMotion() && shot && shot.kind === 'relabel' && shot.starts && shot.w1 > shot.g0) {
      const u = (p - shot.g0) / (shot.w1 - shot.g0);
      if (u > 0 && u < 1.25) for (const sid of shot.starts) {
        const q = stationPos(sid); if (!q) continue;
        for (const d of [0, 0.3]) { const v = U.clamp((u - d) / 0.9, 0, 1); if (v <= 0 || v >= 1) continue; c.globalAlpha = (1 - v) * 0.85; c.strokeStyle = lineColor(H.lines[shot.line]); c.lineWidth = 3 * kz; c.beginPath(); c.arc(q[0], q[1], LW * 0.6 + v * 40 * kz, 0, Math.PI * 2); c.stroke(); }
      }
      c.globalAlpha = 1;
    }
    // 站标
    const labels = [];
    stLines.forEach(function (ls, sid) {
      const info = D.stInfo.get(sid), former = H.stations[sid];
      if (!info || p < info.p0 || (former.virtualAfter && p >= D.W.t2p(timeOf(former.gone, Infinity)))) return;
      const q = stationPos(sid); if (!q) return;
      const pop = ease((p - info.p0) / 0.006), scale = 0.4 + 0.6 * pop;
      if (ls.length > 1) {
        const hub = F.hub.get(sid), hx = hub ? hub.x : q[0], hy = hub ? hub.y : q[1], gr = hub ? hub.r : (geo ? 11 : 12.5);
        drawHub(c, hx, hy, gr * scale * kz, ls.map(function (l) { return lineColor(H.lines[l]); }), P);
        labels.push({ sid: sid, x: hx, y: hy, r: gr * 1.15 * kz, hub: 1, name: info.name, a: pop });
      } else {
        const r = (geo ? 6.5 : 7.2) * scale * kz;
        c.fillStyle = '#fff'; c.strokeStyle = lineColor(H.lines[ls[0]]); c.lineWidth = P.stW; c.beginPath(); c.arc(q[0], q[1], r, 0, 7); c.fill(); c.stroke();
        labels.push({ sid: sid, x: q[0], y: q[1], r: r, hub: 0, name: info.name, a: pop });
      }
    });
    // 站名：字小到看不清时只留换乘站，再小就都不写
    const px = 20 * kz * sc, fs = 20 * kz;
    if (px >= 6.2) {
      labels.sort(function (m, n) { return n.hub - m.hub; });
      const boxes = [], hit = function (b) { for (const o of boxes) if (b[0] < o[2] && b[2] > o[0] && b[1] < o[3] && b[3] > o[1]) return true; return false; };
      const font = A.mapFont(), x0 = V.x - 40, x1 = V.x + V.w + 40, y0 = V.y - 40, y1 = V.y + V.h + 40;
      c.textBaseline = 'middle'; c.lineJoin = 'round'; c.lineWidth = 4; c.strokeStyle = P.paper; c.fillStyle = P.text;
      for (const l of labels) {
        if (!l.hub && px < 9) continue;
        if (l.x < x0 || l.x > x1 || l.y < y0 || l.y > y1) continue;
        c.font = (l.hub ? '700 ' : '500 ') + fs.toFixed(1) + 'px ' + font;
        const name = CM.I18n ? CM.I18n.text(String(l.name)) : l.name, key = name + '|' + l.hub + '|' + fs.toFixed(1);
        const w = S.tw.get(key) || (S.tw.set(key, c.measureText(name).width), S.tw.get(key)), gap = l.r + 6 * kz;
        const sides = [[l.x + gap, l.y, 'left'], [l.x, l.y - gap - 11, 'center'], [l.x - gap, l.y, 'right'], [l.x, l.y + gap + 11, 'center']], dir = stDir.get(l.sid), natural = dir && Math.abs(dir[1]) * 2.4 < Math.abs(dir[0]) ? 1 : 0, pref = S.side.has(l.sid) ? S.side.get(l.sid) : natural;
        let placed = false;
        for (let k = 0; k < 4 && !placed; k++) {
          const sd = sides[(pref + k) % 4], bx = sd[2] === 'left' ? sd[0] : sd[2] === 'right' ? sd[0] - w : sd[0] - w / 2, b = [bx - 2, sd[1] - 12, bx + w + 2, sd[1] + 12];
          if (hit(b)) continue;
          boxes.push(b); placed = true; if (k) S.side.set(l.sid, (pref + k) % 4);
          c.globalAlpha = l.a; c.textAlign = sd[2]; c.strokeText(name, sd[0], sd[1]); c.fillText(name, sd[0], sd[1]); c.globalAlpha = 1;
        }
      }
    }
    // 信息
    const ym = Math.floor(T * 12 + 1e-6);
    if (ym !== S.lastYM) {
      S.lastYM = ym;
      const y = Math.floor(ym / 12), m = ym % 12 + 1, er = eraAt(D.eras, T);
      S.hud.year.textContent = y + ' 年 ' + m + ' 月';
      if (er && er !== S.lastEra) { S.lastEra = er; S.hud.era.textContent = er.name; S.hud.era.classList.remove('flash'); void S.hud.era.offsetWidth; S.hud.era.classList.add('flash'); }
      if (CM.I18n) { CM.I18n.localize(S.hud.box); }
    }
    const lineSet = new Set(), spans = new Map();
    for (const o of vis) { lineSet.add(o.x.line); spans.set(o.x.base, Math.max(spans.get(o.x.base) || 0, o.g)); }
    let km = 0; for (const [id, progress] of spans) km += (D.km.get(id) || 0) * progress;
    const stat = lineSet.size + ' 条线路 · ' + stLines.size + ' 座车站' + (D.kmOK ? ' · ' + km.toFixed(0) + ' km' : '');
    if (stat !== S.lastStat) { S.lastStat = stat; S.hud.stat.textContent = stat; if (CM.I18n) CM.I18n.localize(S.hud.stat); }
    // 播报：播放经过的事件；拖动进度时只跳过，不补报
    while (S.ni < D.news.length && D.news[S.ni].p <= p) { const e = D.news[S.ni++]; if (S.playing && !S.dragging) pushNews(e.text, lineColor(H.lines[e.line])); }
    while (S.ni > 0 && D.news[S.ni - 1].p > p) S.ni--;
    if (!S.dragging) S.range.value = Math.round(p * 1000);
  }
  function pushNews(text, color) {
    const n = h('div', { class: 'nr-news' }, h('i', { style: { background: color } }), CM.I18n ? CM.I18n.text(text) : text);
    S.hud.news.appendChild(n);
    while (S.hud.news.childNodes.length > 3) S.hud.news.removeChild(S.hud.news.firstChild);
    setTimeout(function () { if (n.parentNode) n.parentNode.removeChild(n); }, 2600);
  }
  function tick(now) {
    if (!S) return;
    S.raf = requestAnimationFrame(tick);
    const dt = Math.min(0.05, (now - (S.last || now)) / 1000); S.last = now;
    if (S.playing && !S.dragging) { S.p = Math.min(1, S.p + dt / S.D.W.dur); S.dirty = true; if (S.p >= 1) { S.playing = false; S.ended = true; syncBtn(); } }
    if (S.dirty || S.cameraMoving) { S.dirty = false; try { paint(dt); } catch (e) { console.error(e); stop(true); } }
  }
  function syncBtn() { if (!S) return; S.btn.innerHTML = ''; S.btn.appendChild(CM.icon(S.playing ? 'pause' : 'play')); S.btn.setAttribute('aria-label', S.playing ? '暂停' : '播放'); S.btn.dataset.tip = S.playing ? '暂停' : (S.ended ? '重播' : '播放'); if (CM.I18n) CM.I18n.localize(S.btn); }

  function buildUI(D) {
    const host = A.canvas(), cv = document.createElement('canvas'); cv.className = 'nr-canvas';
    host.appendChild(cv);
    const hud = { year: h('b'), era: h('span', { class: 'nr-era' }), stat: h('small'), news: h('div', { class: 'nr-newsbox' }) };
    hud.box = h('div', { class: 'nr-hud' }, hud.year, hud.era, hud.stat);
    const btn = h('button', { class: 'nr-play', onclick: function () { if (S.ended) { S.ended = false; S.p = 0; S.ni = 0; S.follow = true; S.snap = true; S.lastEra = null; } S.playing = !S.playing; S.last = 0; syncBtn(); } });
    const range = h('input', { type: 'range', min: '0', max: '1000', value: '0', class: 'nr-range', 'aria-label': '回放进度' });
    range.addEventListener('input', function () { S.p = range.value / 1000; S.ended = false; S.dirty = true; S.dragging = true; S.snap = true; syncBtn(); });
    const finishScrub = function () { if (S) { S.dragging = false; S.last = 0; S.dirty = true; } };
    for (const type of ['change', 'pointercancel', 'lostpointercapture', 'blur']) range.addEventListener(type, finishScrub);
    // 分时代的刻度
    const ticks = h('div', { class: 'nr-ticks' });
    for (const e of D.eras) { if (e.from <= D.H.T0 || e.from >= D.H.T1) continue; ticks.appendChild(h('i', { style: { left: (D.W.t2p(e.from) * 100).toFixed(2) + '%' }, 'data-tip': e.name + ' · ' + Math.floor(e.from) + ' 年起' })); }
    // 只有一种速度（v2.7 玩家反馈：去掉倍速）；没有变化的月份自动快速过去
    const bar = h('div', { class: 'nr-bar' }, btn, h('div', { class: 'nr-track' }, ticks, range), h('button', { class: 'btn sm', onclick: function () { stop(); } }, '退出回放'));
    host.append(hud.box, hud.news, bar);
    return { cv: cv, hud: hud, btn: btn, range: range, bar: bar, finishScrub: finishScrub };
  }
  function start(api) {
    const g = CM.game; if (!g || S || preparing) return;
    A = api;
    const host = A.canvas(), svg = A.svg(); if (!host || !svg) return;
    const wait = h('div', { class: 'nr-wait' }, CM.icon('network', 28), '正在准备回放…'); host.appendChild(wait); if (CM.I18n) CM.I18n.localize(wait);
    A.setBusy(true);
    const replay = A.root() && A.root().querySelector('.nm-replay'); if (replay) replay.disabled = true;
    const job = preparing = { wait: wait, timer: null };
    job.timer = setTimeout(function () {
      if (preparing !== job) return;
      if (CM.game !== g || A.canvas() !== host || A.svg() !== svg) { stop(true); return; }
      let D = null;
      try { D = prepare(g); } catch (e) { console.error(e); }
      wait.remove(); preparing = null;
      if (!D || !A.canvas()) { A.setBusy(false); if (replay) replay.disabled = false; A.ui() && A.ui().toast('线网还不够回放', 'info'); return; }
      svg.classList.add('replaying');
      const R = A.root().querySelector('.nm-replay'); if (R) R.disabled = true;
      const u = buildUI(D);
      S = { D: D, cv: u.cv, ctx: u.cv.getContext('2d'), hud: u.hud, btn: u.btn, range: u.range, bar: u.bar, p: 0, playing: true, ni: 0, follow: true, snap: true, last: 0, P: A.palette(), tw: new Map(), side: new Map(), lastYM: -1, lastEra: null, dirty: true };
      S.onResize = function () { if (S && S.cv === u.cv) S.dirty = true; };
      window.addEventListener('resize', S.onResize);
      S.onBlur = u.finishScrub; window.addEventListener('blur', S.onBlur);
      if (window.ResizeObserver) { S.observer = new ResizeObserver(S.onResize); S.observer.observe(host); }
      syncBtn();
      if (CM.I18n) CM.I18n.localize(u.bar);
      S.raf = requestAnimationFrame(tick);
    }, 30);
  }
  function stop(silent) {
    if (!S && !preparing) return;
    if (preparing) { clearTimeout(preparing.timer); preparing.wait.remove(); preparing = null; }
    if (S) { cancelAnimationFrame(S.raf); window.removeEventListener('resize', S.onResize); window.removeEventListener('blur', S.onBlur); if (S.observer) S.observer.disconnect(); }
    const svg = A.svg(); if (svg) svg.classList.remove('replaying');
    const host = A.canvas();
    if (host) host.querySelectorAll('.nr-canvas, .nr-hud, .nr-bar, .nr-newsbox').forEach(function (el) { el.remove(); });
    S = null;
    A.setBusy(false);
    const R = A.root() && A.root().querySelector('.nm-replay'); if (R) R.disabled = false;
    if (!silent) A.fitView();
  }
  CM.NetReplay = {
    start: start, stop: stop,
    active: function () { return !!S || !!preparing; },
    // 当前回放的总时长（秒）、进度和播报清单（检查与测试用）
    info: function () { if (!S) return null; const F = S.D.layout; return { dur: S.D.W.dur, p: S.p, t: Math.min(S.D.H.now, S.D.W.p2t(S.p)), news: S.D.news.map(function (e) { return e.text; }), pieces: S.D.H.segs.length, relabel: S.D.H.segs.filter(function (x) { return x.relabel; }).length, frames: [[+F.t.toFixed(3), F.n, +S.D.W.t2p(F.t).toFixed(3)]], morph: 0, frame: 0 }; },
    userMoved: function () { if (S) { S.follow = false; S.dirty = true; } },
    dirty: function () { if (S) S.dirty = true; },
  };
})(window.CM);
