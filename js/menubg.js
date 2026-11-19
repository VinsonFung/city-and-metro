'use strict';
// 主菜单背景的动画层（v3.1）：底图是预制的广州画面（浅色、深色各一张），这一层在同一机位上画六条示意地铁线与车站、
// 沿线运行的列车和主干道上的车流。轨迹由 menubg-data.js 提供（画面坐标 + 沿线世界距离），不生成城市、不跑交通模型；
// 镜头平移由 CSS 动画带着底图和这一层一起移动。线路与车站按主题画一次缓存，每帧只画列车和车辆（约 45 列车、1800 辆车；车辆按颜色合并成一条路径一次填充）。
// 深色主题下车辆是车灯（迎面白、背向红），列车亮起车窗。减少动态效果时只画一帧静止画面。
(function (CM) {
  const D = CM.MENU_BG_DATA;
  const MB = CM.MenuBg = { run: function () {} };
  if (!D) return;
  const TRAIN_V = 1.1, TRAIN_DWELL = 1.6, TRAIN_GAP = 12, CAR_N = 1800;   // 列车最高速度（格/秒，画面加速）、停站秒数、同向间隔（格）、车辆数
  const dec = function (o) {
    const n = o.w.length, x = new Float32Array(n), y = new Float32Array(n), w = new Float32Array(n);
    for (let i = 0; i < n; i++) { x[i] = o.p[2 * i] / 1e4; y[i] = o.p[2 * i + 1] / 1e4; w[i] = o.w[i] / 100; }
    return { x: x, y: y, w: w, n: n, L: w[n - 1] };
  };
  const lines = D.lines.map(function (l) { const o = dec(l); o.c = l.c; o.st = l.st.map(function (v) { return v / 100; }); return o; });
  const roads = D.roads.map(function (r) { const o = dec(r); o.k = r.k; return o; }).filter(function (r) { return r.L > 1; });
  // 沿线位置：世界距离 d → 画面坐标（0–1）、走向与每格对应的画面长度（近大远小）
  const at = function (P, d, o) {
    let lo = 0, hi = P.n - 1;
    if (d <= 0) hi = 1; else if (d >= P.L) lo = P.n - 2;
    else while (hi - lo > 1) { const m = (lo + hi) >> 1; if (P.w[m] <= d) lo = m; else hi = m; }
    const dw = P.w[hi] - P.w[lo] || 1e-6, t = Math.max(0, Math.min(1, (d - P.w[lo]) / dw));
    const dx = P.x[hi] - P.x[lo], dy = P.y[hi] - P.y[lo];
    o.x = P.x[lo] + dx * t; o.y = P.y[lo] + dy * t; o.dx = dx; o.dy = dy; o.s = Math.hypot(dx * D.w, dy * D.h) / dw;   // s：每格多少拍摄像素
    return o;
  };
  const rnd = (function () { let s = 20120601; return function () { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; })();
  // ---------- 列车：站间平滑加减速，停站后开往下一站，到终点折返 ----------
  const trains = [];
  lines.forEach(function (P, li) {
    const n = Math.max(2, Math.round(P.L / TRAIN_GAP));
    for (const dir of [1, -1]) for (let k = 0; k < n; k++) {
      const u = (k + (dir > 0 ? 0 : 0.5) + rnd() * 0.3) / n, d0 = u * P.L;
      let i = 0; while (i + 2 < P.st.length && P.st[i + 1] <= d0) i++;
      const a = dir > 0 ? i : i + 1;
      trains.push({ P: P, li: li, dir: dir, i: a, t: rnd() * 6, dwell: rnd() < 0.3 ? rnd() * TRAIN_DWELL : 0 });
    }
  });
  const segTime = function (len) { return len / TRAIN_V + 1.2; };
  const stepTrain = function (T, dt) {
    const st = T.P.st;
    if (T.dwell > 0) { T.dwell -= dt; return; }
    const j = T.i + T.dir;
    if (j < 0 || j >= st.length) { T.dir = -T.dir; T.dwell = TRAIN_DWELL * 1.5; return; }
    T.t += dt;
    const dur = segTime(Math.abs(st[j] - st[T.i]));
    if (T.t >= dur) { T.i = j; T.t = 0; T.dwell = TRAIN_DWELL; }
  };
  const trainPos = function (T) {
    const st = T.P.st, j = Math.max(0, Math.min(st.length - 1, T.i + T.dir));
    if (T.dwell > 0 || j === T.i) return st[T.i];
    const f = Math.min(1, T.t / segTime(Math.abs(st[j] - st[T.i]))), e = f * f * (3 - 2 * f);
    return st[T.i] + (st[j] - st[T.i]) * e;
  };
  // ---------- 车流：按道路等级与长度分配，快速路更密更快；到路段尽头淡出，换一条路淡入 ----------
  const weight = roads.map(function (r) { return r.L * (r.k >= 4 ? 2.6 : 1); }), wsum = weight.reduce(function (a, b) { return a + b; }, 0);
  const pickRoad = function () { let v = rnd() * wsum; for (let i = 0; i < roads.length; i++) { v -= weight[i]; if (v <= 0) return i; } return roads.length - 1; };
  const newCar = function (c, fresh) {
    const r = pickRoad(), R = roads[r];
    c.r = r; c.dir = rnd() < 0.5 ? 1 : -1; c.d = rnd() * R.L; c.v = (R.k >= 4 ? 0.9 + rnd() * 0.5 : 0.5 + rnd() * 0.4); c.a = fresh ? 1 : 0;
    c.tone = rnd(); return c;
  };
  // 路口衔接：每条路两端 8 拍摄像素内找另一条路上最近的点，车开到尽头就接上去继续开；接不上的路端淡出，换一条路淡入
  const grid = new Map(), GS = 16, gkey = function (gx, gy) { return gx * 4096 + gy + 512; };
  roads.forEach(function (R, ri) { for (let i = 0; i < R.n; i++) { const k = gkey(Math.floor(R.x[i] * D.w / GS), Math.floor(R.y[i] * D.h / GS)); let a = grid.get(k); if (!a) grid.set(k, a = []); a.push(ri, i); } });
  const joinAt = function (ri, e) {
    const R = roads[ri], px = R.x[e] * D.w, py = R.y[e] * D.h, gx = Math.floor(px / GS), gy = Math.floor(py / GS); let best = null, bd = 64;
    for (let ix = gx - 1; ix <= gx + 1; ix++) for (let iy = gy - 1; iy <= gy + 1; iy++) {
      const a = grid.get(gkey(ix, iy)); if (!a) continue;
      for (let j = 0; j < a.length; j += 2) { const rj = a[j]; if (rj === ri) continue; const Q = roads[rj], vi = a[j + 1], dx = Q.x[vi] * D.w - px, dy = Q.y[vi] * D.h - py, d = dx * dx + dy * dy; if (d < bd) { bd = d; best = [rj, vi]; } }
    }
    return best;
  };
  roads.forEach(function (R, ri) { R.j0 = joinAt(ri, 0); R.j1 = joinAt(ri, R.n - 1); });
  const cars = []; for (let i = 0; i < CAR_N; i++) cars.push(newCar({}, true));
  const stepCar = function (c, dt) {
    let R = roads[c.r]; c.d += c.v * c.dir * dt;
    let left = c.dir > 0 ? R.L - c.d : c.d;
    if (left <= 0) {
      const J = c.dir > 0 ? R.j1 : R.j0;
      if (!J) { newCar(c, false); return; }
      const Q = roads[J[0]], d = Q.w[J[1]];
      c.r = J[0]; c.d = d; c.dir = J[1] === 0 ? 1 : J[1] === Q.n - 1 ? -1 : (Q.L - d > d ? 1 : -1);
      if (Q.k !== R.k) c.v = Q.k >= 4 ? 0.9 + c.tone * 0.5 : 0.5 + c.tone * 0.4;
      R = Q; left = c.dir > 0 ? R.L - c.d : c.d;
    }
    const J2 = c.dir > 0 ? R.j1 : R.j0;
    c.a = Math.min(c.a + dt / 0.5, J2 ? 1 : Math.min(1, left / 0.35));
  };
  // ---------- 画布 ----------
  let cv = null, ctx = null, W = 0, H = 0, sc = 1, theme = '', cache = null, raf = 0, last = 0, on = false, offT = 0, sized = false;
  const dark = function () { return document.documentElement.dataset.theme === 'dark'; };
  const P0 = {};
  const resize = function () {   // 画布尺寸只在首次和窗口变化后读取（每帧读 clientWidth 会触发样式计算）
    if (sized) return W > 0;
    const box = cv.parentNode, cw = box.clientWidth, ch = box.clientHeight; if (!cw || !ch) return false;
    const dpr = Math.min(1.5, window.devicePixelRatio || 1), k = Math.min(dpr, 2600 / cw);
    const w = Math.round(cw * k), h = Math.round(ch * k);
    if (w !== W || h !== H) { W = cv.width = w; H = cv.height = h; cache = null; }
    sc = W / D.w;   // 拍摄像素 → 画布像素
    sized = true; return true;
  };
  // 线路与车站：近大远小，按每段的透视比例取线宽；按主题缓存成一张图
  const buildCache = function () {
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d'), N = dark(); g.lineCap = 'round'; g.lineJoin = 'round';
    for (const pass of [0, 1]) for (const P of lines) {
      for (let i = 0; i + 1 < P.n; i++) {
        const dw = P.w[i + 1] - P.w[i] || 1e-6, s = Math.hypot((P.x[i + 1] - P.x[i]) * D.w, (P.y[i + 1] - P.y[i]) * D.h) / dw * sc;
        g.beginPath(); g.moveTo(P.x[i] * W, P.y[i] * H); g.lineTo(P.x[i + 1] * W, P.y[i + 1] * H);
        if (pass === 0) { g.strokeStyle = N ? 'rgba(10,16,28,0.55)' : 'rgba(255,255,255,0.92)'; g.lineWidth = Math.max(1.5, s * 0.17); }
        else { g.strokeStyle = P.c; g.globalAlpha = N ? 0.95 : 0.9; g.lineWidth = Math.max(1, s * 0.09); }
        g.stroke(); g.globalAlpha = 1;
      }
    }
    for (const P of lines) for (const d of P.st) {
      at(P, d, P0); const r = Math.max(1.6, P0.s * sc * 0.085);
      g.beginPath(); g.arc(P0.x * W, P0.y * H, r, 0, Math.PI * 2);
      g.fillStyle = N ? '#162133' : '#ffffff'; g.fill(); g.lineWidth = Math.max(1, r * 0.45); g.strokeStyle = N ? P.c : '#3b4656'; g.stroke();
    }
    return c;
  };
  const CAR_L = ['#3d4757', '#556070', '#2b3442', '#6b7686', '#b03a2e', '#24527e', '#c98417', '#3d4757'];
  const draw = function () {
    if (!ctx || !resize()) return;
    const N = dark(), th = N ? 'd' : 'l';
    if (th !== theme || !cache) { theme = th; cache = buildCache(); }
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, W, H); ctx.drawImage(cache, 0, 0);
    // 车辆：右侧通行，按透视缩放；浅色为小色块（按颜色分组成一条路径），深色为车灯（迎面白色、远去红色，光晕加亮点两遍）
    const q = {}, groups = N ? [new Path2D(), new Path2D(), new Path2D(), new Path2D()] : CAR_L.map(function () { return new Path2D(); });
    for (const c of cars) {
      const R = roads[c.r]; at(R, c.d, q); const s = q.s * sc, l = Math.hypot(q.dx * W, q.dy * H) || 1;
      const nx = -q.dy * H / l * c.dir, ny = q.dx * W / l * c.dir, off = s * 0.035, x = q.x * W + nx * off, y = q.y * H + ny * off;
      const z = Math.max(1.5, s * 0.1) * (0.4 + 0.6 * c.a);
      if (x < -4 || y < -4 || x > W + 4 || y > H + 4) continue;
      if (N) {
        const k = (q.dy * c.dir) > 0 ? 0 : 2;   // 朝画面下方（朝镜头）开来的车是白色车头灯，远去的是红色尾灯
        groups[k].moveTo(x + z * 1.7, y); groups[k].arc(x, y, z * 1.7, 0, 6.2832);
        groups[k + 1].moveTo(x + z * 0.55, y); groups[k + 1].arc(x, y, z * 0.55, 0, 6.2832);
      } else groups[(c.tone * CAR_L.length) | 0].rect(x - z * 0.65, y - z * 0.65, z * 1.3, z * 1.3);
    }
    if (N) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.2; ctx.fillStyle = '#ffe9b8'; ctx.fill(groups[0]); ctx.fillStyle = '#ff4a36'; ctx.fill(groups[2]);
      ctx.globalAlpha = 0.95; ctx.fillStyle = '#fff6e0'; ctx.fill(groups[1]); ctx.fillStyle = '#ff5a44'; ctx.fill(groups[3]);
    } else { ctx.globalAlpha = 0.9; CAR_L.forEach(function (col, i) { ctx.fillStyle = col; ctx.fill(groups[i]); }); }
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
    // 列车：沿线两条轨道（右侧行车），车身为线路色的圆角长条，深色主题亮起车窗
    for (const T of trains) {
      const P = T.P; at(P, trainPos(T), q);
      const s = q.s * sc, l = Math.hypot(q.dx * W, q.dy * H) || 1, ux = q.dx * W / l * T.dir, uy = q.dy * H / l * T.dir, off = s * 0.07;
      const x = q.x * W - uy * off, y = q.y * H + ux * off, len = Math.max(10, s * 0.95), wid = Math.max(3.2, s * 0.26);
      ctx.save(); ctx.translate(x, y); ctx.rotate(Math.atan2(uy, ux));
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(-len / 2, -wid / 2, len, wid, wid / 2); else ctx.rect(-len / 2, -wid / 2, len, wid);
      if (N) { ctx.shadowColor = P.c; ctx.shadowBlur = wid * 2.4; ctx.fillStyle = P.c; ctx.fill(); ctx.shadowBlur = 0; ctx.fillStyle = 'rgba(255,250,228,0.95)'; ctx.fillRect(-len * 0.4, -wid * 0.16, len * 0.8, wid * 0.32); }
      else { ctx.shadowColor = 'rgba(30,45,70,0.35)'; ctx.shadowBlur = wid; ctx.lineWidth = Math.max(1.4, wid * 0.42); ctx.strokeStyle = '#ffffff'; ctx.stroke(); ctx.shadowBlur = 0; ctx.fillStyle = P.c; ctx.fill(); ctx.fillStyle = 'rgba(255,255,255,0.75)'; ctx.fillRect(-len * 0.36, -wid * 0.12, len * 0.72, wid * 0.24); }
      ctx.restore();
    }
  };
  const frame = function (t) {
    raf = 0; if (!on) return;
    const dt = last ? Math.min(0.1, (t - last) / 1000) : 0;
    if (last && dt < 0.024) { raf = requestAnimationFrame(frame); return; }   // 约 40 帧 / 秒就够流畅
    last = t;
    if (!document.hidden) { for (const T of trains) stepTrain(T, dt); for (const c of cars) stepCar(c, dt); draw(); }
    raf = requestAnimationFrame(frame);
  };
  // Redraw once if the movement preference or display scale changes on the menu.
  const reduced = function () { return CM.Settings && CM.Settings.reducedMotion ? CM.Settings.reducedMotion() : false; };
  MB.run = function (show) {
    clearTimeout(offT);
    if (!show) { offT = setTimeout(function () { on = false; if (raf) { cancelAnimationFrame(raf); raf = 0; } }, 700); return; }   // 背景淡出后再停
    if (!cv) {
      const box = document.querySelector('#menubg .mbg-cam'); if (!box) return;
      cv = document.createElement('canvas'); cv.className = 'mbg-fx'; box.appendChild(cv); ctx = cv.getContext('2d');
      // 切换主题（视图过渡的回调里）立即按新主题重画，圆形展开的新画面里就是新配色
      new MutationObserver(function () { if (theme !== (dark() ? 'd' : 'l')) draw(); }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
      window.addEventListener('resize', function () { sized = false; if (cv) draw(); });
    }
    document.getElementById('menubg').style.setProperty('--cm-menu-motion', reduced() ? 'paused' : 'running');
    if (reduced()) { on = false; draw(); return; }
    if (!on) { on = true; last = 0; draw(); if (!raf) raf = requestAnimationFrame(frame); }
  };
})(window.CM);
