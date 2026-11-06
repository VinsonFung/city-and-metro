'use strict';
// 网格（视图工具）：在地面上画淡色网格，并可让建站、绘线与拖动控制点吸附到网格交叉点。默认为公里网格（正方形，以地图左上角为原点，v2.6.1 玩家反馈：
// 经纬度网格看不出一格有多远），设置里可改为经纬度网格；虚构地图（青湾）没有经纬度，只有公里网格。
// 间隔随缩放在 1-2-5 序列中自动选择（屏幕间距约 26 px 以上），更细一级的网格线随放大淡入；每隔几条画一条稍深的主线并在画面边缘标注。
// 只影响画面与落点，不进入存档、不改变任何模拟。
(function (CM) {
  const U = CM.U;
  const DEG = [0.0005, 0.001, 0.002, 0.005, 0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1];
  const KM = [0.1, 0.25, 0.5, 1, 2, 5, 10];
  const MIN_PX = 26, FULL_PX = 44;   // 网格线最小屏幕间距；在 26–44 px 之间淡入（较细的网格，便于精确落点）
  const FONT = '"PingFang SC","Microsoft YaHei","Noto Sans SC",sans-serif';
  const S = CM.Settings;

  // 坐标系：真实城市为经纬度（G.proj：x = (lon − lon0)·kx，y = (lat0 − lat)·ky，格），虚构地图为公里
  function frame() {
    const G = CM.GEO, p = G && G.proj;
    if (p && p.kx && p.ky && S && S.get('gridUnit') === 'deg') return { geo: true, kx: p.kx, ky: p.ky, x0: p.lon0, y0: p.lat0, steps: DEG };
    const k = 1000 / CM.CFG.CELL_M;   // 每公里格数
    return { geo: false, kx: k, ky: k, x0: 0, y0: 0, steps: KM };
  }
  // 数值 ↔ 格坐标（u：经度 / 东向公里，v：纬度 / 南向公里）
  const ux = function (f, u) { return (u - f.x0) * f.kx; };
  const vy = function (f, v) { return f.geo ? (f.y0 - v) * f.ky : (v - f.y0) * f.ky; };
  const xu = function (f, x) { return f.x0 + x / f.kx; };
  const yv = function (f, y) { return f.geo ? f.y0 - y / f.ky : f.y0 + y / f.ky; };
  // 主线间隔：1、2 开头的间隔 ×5，5 开头的 ×2（如 0.002° → 0.01°，0.005° → 0.01°）
  const majorOf = function (s) { if (s === 0.25) return 1; const m = Math.round(s / Math.pow(10, Math.floor(Math.log10(s) + 1e-9))); return s * (m === 5 ? 2 : 5); };
  const decimals = function (s) { return s === 0.25 ? 2 : Math.max(0, -Math.floor(Math.log10(s) + 1e-9)); };

  // 当前缩放下的间隔：最细一级（屏幕间距 ≥ 26 px）及其淡入程度；吸附使用清楚可见的那一级
  function levels(R) {
    const f = frame(), M = R.M, z = R.z;
    // 一个单位（1° 或 1 km）在屏幕上的长度：取经向、纬向中较短的一个
    const px = Math.min(Math.hypot(M[0], M[2]) * f.kx, Math.hypot(M[1], M[3]) * f.ky) * z;
    let i = f.steps.findIndex(function (s) { return s * px >= MIN_PX; });
    if (i < 0) i = f.steps.length - 1;
    const minor = f.steps[i], fade = U.clamp((minor * px - MIN_PX) / (FULL_PX - MIN_PX), 0, 1);
    const major = majorOf(minor);
    return { f: f, minor: minor, major: major, fade: fade, snap: fade >= 0.5 ? minor : (f.steps[i + 1] || major), px: px };
  }

  const Grid = {
    on: function () { return !!(S && S.get('grid')); },
    snapOn: function () { return this.on() && !!(S && S.get('gridSnap')); },
    toggle: function () { if (S) S.set('grid', !this.on()); },
    toggleSnap: function () { if (S) S.set('gridSnap', !S.get('gridSnap')); },
    isGeo: function () { return frame().geo; },
    // 吸附：最近的网格交叉点（只在显示网格且开启吸附时生效）
    snap: function (R, x, y) {
      if (!this.snapOn() || !R || !R.M) return null;
      const L = levels(R), f = L.f, s = L.snap;
      const u = Math.round(xu(f, x) / s) * s, v = Math.round(yv(f, y) / s) * s;
      return { x: ux(f, u), y: vy(f, v), u: u, v: v, step: s };
    },
    label: function (val, axis, step, f) {
      f = f || frame();
      const d = decimals(step), t = Math.abs(val).toFixed(d);
      if (!f.geo) return (+t).toString() + ' km';
      return t + '°' + (axis === 'u' ? (val >= 0 ? 'E' : 'W') : (val >= 0 ? 'N' : 'S'));
    },
    // 一格的实际大小：公里网格为边长，经纬度网格为约合的东西 × 南北距离
    stepText: function (R) {
      const L = levels(R), s = L.snap, f = L.f, m = function (v) { return v < 1000 ? Math.round(v) + ' m' : +(v / 1000).toFixed(2) + ' km'; };
      if (!f.geo) return m(s * 1000);
      const cm = CM.CFG.CELL_M;
      return s + '° ≈ ' + m(s * f.kx * cm) + ' × ' + m(s * f.ky * cm);
    },
    // 当前间隔的说明（工具提示与消息用）
    describe: function (R) { return '间隔 ' + this.stepText(R); },

    // 地面网格：在地面之后、建筑之前绘制（2.5D 中被楼宇遮挡，保持低调）
    draw: function (ctx, R) {
      if (!this.on() || !R.game || R.game.preview) return;
      const L = levels(R), f = L.f, v = R.view, W = CM.CFG.W, H = CM.CFG.H;
      const x0 = Math.max(0, v.x0), x1 = Math.min(W, v.x1), y0 = Math.max(0, v.y0), y1 = Math.min(H, v.y1);
      if (x1 <= x0 || y1 <= y0) return;
      const dark = R.themeName === 'dark', under = U.smooth(R.cam.under || 0);
      const col = dark ? '176,204,236' : '58,92,136';
      const aMinor = (dark ? 0.085 : 0.1) * L.fade * (1 - 0.3 * under), aMajor = (dark ? 0.17 : 0.2) * (1 - 0.3 * under);
      const isMajor = function (val) { const r = val / L.major; return Math.abs(r - Math.round(r)) < 1e-6; };
      ctx.save();
      ctx.setTransform(R.dpr, 0, 0, R.dpr, 0, 0);
      ctx.lineCap = 'butt';
      const pass = function (major) {
        ctx.beginPath();
        // 经线（或南北向公里线）
        const ua = xu(f, x0), ub = xu(f, x1);
        for (let k = Math.ceil(Math.min(ua, ub) / L.minor), n = 0; k * L.minor <= Math.max(ua, ub) + 1e-12 && n < 400; k++, n++) {
          const u = k * L.minor; if (isMajor(u) !== major) continue;
          const x = ux(f, u), a = R.P(x, y0, 0), b = R.P(x, y1, 0);
          ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
        }
        // 纬线（或东西向公里线）
        const va = yv(f, y0), vb = yv(f, y1);
        for (let k = Math.ceil(Math.min(va, vb) / L.minor), n = 0; k * L.minor <= Math.max(va, vb) + 1e-12 && n < 400; k++, n++) {
          const val = k * L.minor; if (isMajor(val) !== major) continue;
          const y = vy(f, val), a = R.P(x0, y, 0), b = R.P(x1, y, 0);
          ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
        }
      };
      if (aMinor > 0.004) { pass(false); ctx.strokeStyle = 'rgba(' + col + ',' + aMinor.toFixed(3) + ')'; ctx.lineWidth = 1; ctx.stroke(); }
      pass(true); ctx.strokeStyle = 'rgba(' + col + ',' + aMajor.toFixed(3) + ')'; ctx.lineWidth = 1.2; ctx.stroke();
      ctx.restore();
    },

    // 边缘标注：经线标在画面下缘、纬线标在画面右缘；只标主线（间隔较大时全部标注）。在标注层之后绘制
    drawLabels: function (ctx, R) {
      if (!this.on() || !R.game || R.game.preview) return;
      const L = levels(R), f = L.f, v = R.view, W = CM.CFG.W, H = CM.CFG.H;
      const x0 = Math.max(0, v.x0), x1 = Math.min(W, v.x1), y0 = Math.max(0, v.y0), y1 = Math.min(H, v.y1);
      if (x1 <= x0 || y1 <= y0) return;
      const step = L.minor * L.px >= 90 && L.fade >= 1 ? L.minor : L.major;
      const dark = R.themeName === 'dark';
      const pad = 10, rx0 = pad, ry0 = pad, rx1 = R.w - pad, ry1 = R.h - pad;
      // 线段与画面矩形求交（Liang–Barsky），返回可见部分两端
      const clip = function (a, b) {
        let t0 = 0, t1 = 1; const dx = b.x - a.x, dy = b.y - a.y;
        const P = [-dx, dx, -dy, dy], Q = [a.x - rx0, rx1 - a.x, a.y - ry0, ry1 - a.y];
        for (let i = 0; i < 4; i++) {
          if (Math.abs(P[i]) < 1e-9) { if (Q[i] < 0) return null; continue; }
          const r = Q[i] / P[i];
          if (P[i] < 0) { if (r > t1) return null; if (r > t0) t0 = r; } else { if (r < t0) return null; if (r < t1) t1 = r; }
        }
        return [{ x: a.x + dx * t0, y: a.y + dy * t0 }, { x: a.x + dx * t1, y: a.y + dy * t1 }];
      };
      ctx.save();
      ctx.setTransform(R.dpr, 0, 0, R.dpr, 0, 0);
      ctx.font = '500 10.5px ' + FONT;
      ctx.lineJoin = 'round';
      const fill = dark ? 'rgba(196,216,240,0.62)' : 'rgba(52,80,116,0.62)', halo = dark ? 'rgba(18,26,38,0.7)' : 'rgba(246,249,252,0.85)';
      const text = function (s, x, y, align, base) {
        ctx.textAlign = align; ctx.textBaseline = base;
        ctx.strokeStyle = halo; ctx.lineWidth = 3; ctx.strokeText(s, x, y);
        ctx.fillStyle = fill; ctx.fillText(s, x, y);
      };
      // 标注只放在各自的边上（经线在下缘、纬线在右缘，或线在地图边界处结束的位置）；2.5D 中斜向的线不会把标注挤到其他边角，
      // 右下角留空，避免两组标注重叠
      const E = 0.5, onL = function (p) { return p.x <= rx0 + E; }, onR = function (p) { return p.x >= rx1 - E; }, onT = function (p) { return p.y <= ry0 + E; }, onB = function (p) { return p.y >= ry1 - E; };
      const ua = xu(f, x0), ub = xu(f, x1);
      for (let k = Math.ceil(Math.min(ua, ub) / step), n = 0; k * step <= Math.max(ua, ub) + 1e-12 && n < 200; k++, n++) {
        const u = k * step, x = ux(f, u), seg = clip(R.P(x, y0, 0), R.P(x, y1, 0));
        if (!seg) continue;
        const p = seg[0].y > seg[1].y ? seg[0] : seg[1];
        if (onL(p) || onR(p) || onT(p) || p.x > rx1 - 70) continue;
        text(this.label(u, 'u', step, f), p.x + 3, p.y - 2, 'left', 'bottom');
      }
      const va = yv(f, y0), vb = yv(f, y1);
      for (let k = Math.ceil(Math.min(va, vb) / step), n = 0; k * step <= Math.max(va, vb) + 1e-12 && n < 200; k++, n++) {
        const val = k * step, y = vy(f, val), seg = clip(R.P(x0, y, 0), R.P(x1, y, 0));
        if (!seg) continue;
        const p = seg[0].x > seg[1].x ? seg[0] : seg[1];
        if (onL(p) || onT(p) || onB(p) || p.y > ry1 - 22 || p.y < ry0 + 14) continue;
        text(this.label(val, 'v', step, f), p.x - 2, p.y - 3, 'right', 'bottom');
      }
      ctx.restore();
    },

    // 吸附标记：在将要落点的交叉点上画一个淡色十字，提示已吸附
    drawSnapMark: function (ctx, R, p) {
      if (!p) return;
      const q = R.P(p.x, p.y, 0), dark = R.themeName === 'dark';
      ctx.save();
      ctx.strokeStyle = dark ? 'rgba(176,204,236,0.75)' : 'rgba(58,92,136,0.6)'; ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.moveTo(q.x - 15, q.y); ctx.lineTo(q.x - 9, q.y); ctx.moveTo(q.x + 9, q.y); ctx.lineTo(q.x + 15, q.y);
      ctx.moveTo(q.x, q.y - 15); ctx.lineTo(q.x, q.y - 9); ctx.moveTo(q.x, q.y + 9); ctx.lineTo(q.x, q.y + 15); ctx.stroke();
      ctx.restore();
    },
  };
  CM.Grid = Grid;
})(window.CM);
