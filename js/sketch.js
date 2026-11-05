'use strict';
// 手绘简图与图文分页（v2.3）：新手教程的任务简报、经营挑战的财政小课。
// 简图用带固定抖动的双线条模拟手绘（同一张图每次画出来都一样），颜色取主题变量，浅色 / 深色都可读。
(function (CM) {
  const U = CM.U, h = U.h, ic = function (n, s) { return CM.icon(n, s); };
  // ---------------- 手绘笔触 ----------------
  function pen(seed) {
    let s = 0; for (const c of String(seed)) s = (s * 31 + c.charCodeAt(0)) >>> 0;
    const rnd = function () { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296 - 0.5; };
    const f = function (v) { return (Math.round(v * 10) / 10).toString(); };
    const P = {
      // 线段：两遍略有偏差的笔画，中点轻微弯曲
      line: function (x1, y1, x2, y2, cls, j) {
        j = j == null ? 1.6 : j; let d = '';
        for (let k = 0; k < 2; k++) {
          const mx = (x1 + x2) / 2 + rnd() * j * 2, my = (y1 + y2) / 2 + rnd() * j * 2;
          d += 'M' + f(x1 + rnd() * j) + ' ' + f(y1 + rnd() * j) + 'Q' + f(mx) + ' ' + f(my) + ' ' + f(x2 + rnd() * j) + ' ' + f(y2 + rnd() * j);
        }
        return '<path class="' + (cls || 'sk-ink') + '" d="' + d + '"/>';
      },
      // 折线（可闭合），fill 为填充类名
      poly: function (pts, cls, fill, close) {
        let out = '';
        if (fill) out += '<path class="' + fill + '" d="M' + pts.map(function (p) { return f(p[0] + rnd()) + ' ' + f(p[1] + rnd()); }).join('L') + 'Z"/>';
        for (let i = 0; i + 1 < pts.length; i++) out += P.line(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], cls);
        if (close) out += P.line(pts[pts.length - 1][0], pts[pts.length - 1][1], pts[0][0], pts[0][1], cls);
        return out;
      },
      rect: function (x, y, w, hh, cls, fill) { return P.poly([[x, y], [x + w, y], [x + w, y + hh], [x, y + hh]], cls, fill, true); },
      circle: function (cx, cy, r, cls, fill) {
        let out = '';
        for (let k = 0; k < 2; k++) {
          const n = 14, pts = [];
          for (let i = 0; i <= n; i++) { const a = i / n * Math.PI * 2 + k * 0.3, rr = r * (1 + rnd() * 0.08); pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]); }
          out += '<path class="' + (k === 0 && fill ? fill + ' ' : '') + (cls || 'sk-ink') + '" d="M' + pts.map(function (p) { return f(p[0]) + ' ' + f(p[1]); }).join('L') + '"/>';
        }
        return out;
      },
      // 波浪带（河流）：上下两条手绘曲线之间填色
      river: function (y, w, hw) {
        const top = [], bot = [];
        for (let x = -10; x <= w + 10; x += 20) { top.push([x, y - hw + Math.sin(x / 40) * 5 + rnd() * 2]); bot.push([x, y + hw + Math.sin(x / 40 + 0.6) * 5 + rnd() * 2]); }
        const d = 'M' + top.map(function (p) { return f(p[0]) + ' ' + f(p[1]); }).join('L') + 'L' + bot.reverse().map(function (p) { return f(p[0]) + ' ' + f(p[1]); }).join('L') + 'Z';
        let out = '<path class="sk-water" d="' + d + '"/>';
        for (let x = 30; x < w; x += 70) out += '<path class="sk-wave" d="M' + f(x) + ' ' + f(y + rnd() * 4) + 'q8 -5 16 0t16 0"/>';
        return out;
      },
      text: function (x, y, t, cls, anchor) { return '<text class="' + (cls || 'sk-t') + '" x="' + f(x) + '" y="' + f(y) + '" text-anchor="' + (anchor || 'middle') + '">' + U.esc(t) + '</text>'; },
      house: function (x, y, s) { s = s || 1; return P.poly([[x, y], [x + 8 * s, y - 8 * s], [x + 16 * s, y], [x + 16 * s, y + 12 * s], [x, y + 12 * s]], 'sk-ink', 'sk-home', true); },
      tower: function (x, y, w, hh) { let out = P.rect(x, y - hh, w, hh, 'sk-ink', 'sk-work'); for (let yy = y - hh + 6; yy < y - 4; yy += 8) out += P.line(x + 3, yy, x + w - 3, yy, 'sk-thin', 0.6); return out; },
      coin: function (x, y, r) { return P.circle(x, y, r || 8, 'sk-ink', 'sk-gold') + P.text(x, y + 4, '¥', 'sk-t sk-small'); },
      arrow: function (x1, y1, x2, y2, cls) {
        const a = Math.atan2(y2 - y1, x2 - x1), l = 8;
        return P.line(x1, y1, x2, y2, cls || 'sk-ink') + P.line(x2, y2, x2 - Math.cos(a - 0.5) * l, y2 - Math.sin(a - 0.5) * l, cls || 'sk-ink', 0.6) + P.line(x2, y2, x2 - Math.cos(a + 0.5) * l, y2 - Math.sin(a + 0.5) * l, cls || 'sk-ink', 0.6);
      },
      train: function (x, y, w) { w = w || 46; return P.rect(x, y, w, 14, 'sk-ink', 'sk-metro-f') + P.circle(x + 9, y + 16, 3, 'sk-ink') + P.circle(x + w - 9, y + 16, 3, 'sk-ink') + P.rect(x + 5, y + 3, 8, 6, 'sk-thin') + P.rect(x + w - 13, y + 3, 8, 6, 'sk-thin'); },
    };
    return P;
  }
  const wrap = function (name, body, vb) { return '<svg class="sk" viewBox="0 0 ' + (vb || '320 180') + '" role="img" aria-label="' + U.esc(name) + '">' + body + '</svg>'; };

  // ---------------- 简图 ----------------
  const D = {
    // 教程任务：江北老城的就业中心与江南的居住区，只能挤过一座大桥
    mission: function (o) {
      const P = pen('mission'); o = o || {};
      let s = P.river(92, 320, 14);
      for (let i = 0; i < 4; i++) s += P.tower(28 + i * 22, 66, 16, 26 + (i % 2) * 14);
      s += P.text(70, 20, '老城 · 就业中心', 'sk-t sk-b');
      for (let i = 0; i < 4; i++) s += P.house(190 + i * 26, 128 + (i % 2) * 8, 1);
      s += P.text(240, 172, '南岸 · 居住区', 'sk-t sk-b');
      s += P.rect(232, 74, 14, 36, 'sk-ink', 'sk-road') + P.text(252, 92, '大桥', 'sk-t sk-small', 'start');
      for (let i = 0; i < 3; i++) s += P.rect(235, 80 + i * 9, 8, 5, 'sk-thin', 'sk-car');
      s += '<path class="sk-metro" d="M206 126 C 190 104, 150 96, 112 60"/>';
      s += P.circle(206, 126, 6, 'sk-ink', 'sk-st') + P.circle(160, 92, 6, 'sk-ink', 'sk-st') + P.circle(112, 60, 6, 'sk-ink', 'sk-st');
      s += P.text(150, 120, '你的第一条地铁', 'sk-t sk-accent');
      if (o.clock) s += P.circle(276, 34, 13, 'sk-ink', 'sk-paper') + P.line(276, 34, 276, 26, 'sk-ink', 0.4) + P.line(276, 34, 283, 37, 'sk-ink', 0.4) + P.text(276, 62, o.clock, 'sk-t sk-small');
      return wrap('任务简图', s);
    },
    moneyIn: function () {
      const P = pen('in');
      let s = P.rect(130, 66, 60, 56, 'sk-ink', 'sk-paper') + P.text(160, 100, '地铁资金', 'sk-t sk-b');
      s += P.rect(20, 18, 54, 36, 'sk-ink', 'sk-work') + P.poly([[14, 18], [47, 4], [80, 18]], 'sk-ink') + P.text(47, 70, '政府拨款', 'sk-t sk-small') + P.text(47, 82, '每月一次', 'sk-t sk-small sk-muted');
      s += P.rect(20, 118, 12, 30, 'sk-ink', 'sk-paper') + P.rect(40, 118, 12, 30, 'sk-ink', 'sk-paper') + P.line(32, 132, 40, 128, 'sk-ink') + P.text(47, 168, '票款 · 每天', 'sk-t sk-small');
      s += P.poly([[262, 22], [286, 22], [282, 42], [266, 42]], 'sk-ink', 'sk-gold', true) + P.line(274, 42, 274, 54, 'sk-ink') + P.line(264, 56, 284, 56, 'sk-ink') + P.text(274, 78, '任务奖励', 'sk-t sk-small');
      s += P.arrow(80, 44, 128, 76) + P.arrow(58, 134, 128, 108) + P.arrow(264, 64, 194, 82);
      s += P.coin(104, 54, 7) + P.coin(96, 122, 7) + P.coin(230, 66, 7);
      // 车站商业与政府合同
      s += P.rect(250, 122, 24, 30, 'sk-ink', 'sk-work') + P.rect(280, 132, 20, 20, 'sk-ink', 'sk-paper') + P.line(284, 138, 296, 138, 'sk-thin') + P.line(284, 144, 296, 144, 'sk-thin') + P.text(274, 168, '商业 · 合同', 'sk-t sk-small');
      s += P.arrow(246, 128, 194, 108);
      return wrap('钱从哪里来', s);
    },
    fleetCost: function () {
      const P = pen('fleetCost');
      let s = P.train(26, 46, 96) + P.line(16, 70, 136, 70, 'sk-ink') + P.text(76, 34, '整列购买', 'sk-t sk-b') + P.text(76, 90, '计入建设支出', 'sk-t sk-small sk-muted');
      s += P.arrow(138, 58, 176, 58) + P.coin(158, 44, 7);
      s += P.rect(182, 30, 118, 62, 'sk-ink', 'sk-paper') + P.text(241, 52, '运营费', 'sk-t sk-b') + P.text(241, 70, '车厢公里 × 车型系数', 'sk-t sk-small') + P.text(241, 84, '超龄 ×1.25', 'sk-t sk-small sk-muted');
      s += P.rect(38, 112, 76, 40, 'sk-ink', 'sk-gold') + P.text(76, 136, '残值出售', 'sk-t sk-b');
      s += P.rect(182, 112, 118, 40, 'sk-ink', 'sk-work') + P.text(241, 136, '调往其他线路', 'sk-t sk-b');
      s += P.text(160, 172, '车多发车密，但钱也花得多', 'sk-t sk-small sk-accent');
      return wrap('列车也是一笔账', s);
    },
    tod: function () {
      const P = pen('tod');
      let s = P.line(20, 148, 300, 148, 'sk-ink');
      const stage = function (x, label, hh, cls) { return P.rect(x, 148 - hh, 62, hh, 'sk-ink', cls) + P.text(x + 31, 168, label, 'sk-t sk-small'); };
      s += stage(26, '广告便利店', 22, 'sk-paper') + stage(128, '站内商业街', 48, 'sk-work') + stage(230, '站城一体', 92, 'sk-gold');
      s += P.arrow(92, 118, 124, 108, 'sk-thin') + P.arrow(194, 96, 226, 76, 'sk-thin');
      s += P.coin(57, 112, 7) + P.coin(159, 86, 7) + P.coin(261, 42, 7);
      s += P.text(26, 34, '客流够大才赚钱', 'sk-t sk-b sk-accent', 'start') + P.text(26, 52, '太少会亏：有维护成本', 'sk-t sk-small sk-muted', 'start');
      return wrap('车站商业', s);
    },
    contract: function () {
      const P = pen('contract');
      const step = function (x, y, t, sub, cls) { return P.rect(x, y, 84, 44, 'sk-ink', cls || 'sk-paper') + P.text(x + 42, y + 20, t, 'sk-t sk-b') + P.text(x + 42, y + 35, sub, 'sk-t sk-small sk-muted'); };
      let s = step(10, 20, '投标', '三档报价') + P.arrow(96, 42, 116, 42) + step(118, 20, '中标建设', '自己出资', 'sk-work') + P.arrow(204, 42, 224, 42) + step(226, 20, '按期开通', '补助＋退保证金', 'sk-gold');
      s += P.arrow(268, 66, 268, 90) + step(226, 92, '运营考核', '可用性付费', 'sk-home') + P.arrow(224, 114, 204, 114) + step(118, 92, '期满移交', '信誉上升');
      s += P.circle(52, 114, 22, 'sk-ink', 'sk-bad') + P.text(52, 119, '违约', 'sk-t sk-b sk-white') + P.line(118, 114, 78, 114, 'sk-thin');
      s += P.text(160, 164, '违约：扣保证金、拨款打折、信誉下降', 'sk-t sk-small');
      return wrap('政府合同', s);
    },
    grant: function () {
      const P = pen('grant');
      const box = function (x, label, sub, cls) { return P.rect(x, 58, 62, 46, 'sk-ink', cls || 'sk-paper') + P.text(x + 31, 80, label, 'sk-t sk-b') + P.text(x + 31, 96, sub, 'sk-t sk-small sk-muted'); };
      let s = box(6, '基础额度', '城市与年代') + P.text(74, 86, '×', 'sk-t sk-b') + box(82, '财力', '城市经济') + P.text(150, 86, '×', 'sk-t sk-b') + box(158, '满意度', '乘客评价', 'sk-home') + P.text(226, 86, '×', 'sk-t sk-b') + box(234, '任务', '完成或未完成');
      s += P.text(160, 30, '每月拨款 =', 'sk-t sk-b sk-accent');
      s += P.circle(189, 140, 14, 'sk-ink', 'sk-gold') + P.line(182, 137, 184, 137, 'sk-ink', 0.3) + P.line(194, 137, 196, 137, 'sk-ink', 0.3) + '<path class="sk-ink" d="M182 144 Q189 150 196 144"/>';
      s += P.text(210, 145, '满意度越高拨款越多', 'sk-t sk-small', 'start');
      return wrap('拨款怎么算', s);
    },
    moneyOut: function () {
      const P = pen('out');
      let s = P.line(40, 150, 40, 30, 'sk-ink') + P.line(40, 30, 120, 30, 'sk-ink') + P.line(110, 30, 110, 60, 'sk-thin') + P.rect(98, 60, 24, 16, 'sk-ink', 'sk-gold') + P.line(26, 150, 70, 150, 'sk-ink');
      s += P.text(80, 172, '建设：确认时一次付清', 'sk-t sk-small');
      s += P.train(190, 92, 70) + P.line(180, 116, 300, 116, 'sk-ink') + P.rect(206, 40, 40, 30, 'sk-ink', 'sk-paper') + P.text(226, 60, 'M', 'sk-t sk-b');
      s += P.text(240, 140, '运营：每天都要花', 'sk-t sk-small') + P.text(240, 156, '线越长、站越多越贵', 'sk-t sk-small sk-muted');
      s += P.coin(150, 60, 7) + P.coin(162, 74, 7) + P.arrow(150, 84, 150, 120, 'sk-thin');
      return wrap('钱花在哪里', s);
    },
    fare: function () {
      const P = pen('fare');
      let s = P.poly([[150, 140], [160, 120], [170, 140]], 'sk-ink', 'sk-paper', true) + P.line(50, 112, 270, 128, 'sk-ink');
      s += P.coin(70, 98, 10) + P.coin(92, 96, 10) + P.text(80, 74, '票价高：每人付得多', 'sk-t sk-small');
      for (let i = 0; i < 5; i++) s += P.circle(214 + (i % 3) * 16, 110 - Math.floor(i / 3) * 16, 6, 'sk-ink', 'sk-home');
      s += P.text(238, 74, '乘客变少', 'sk-t sk-small');
      s += P.text(160, 168, '收入 = 乘客 × 票价，两头要平衡', 'sk-t sk-b sk-accent');
      return wrap('票价的取舍', s);
    },
    econ: function () {
      const P = pen('econ');
      const hs = [40, 54, 66, 48, 58, 74, 86];
      let s = P.line(30, 140, 300, 140, 'sk-ink') + P.line(30, 140, 30, 30, 'sk-ink');
      hs.forEach(function (v, i) { s += P.rect(44 + i * 34, 140 - v, 20, v, 'sk-ink', i === 3 ? 'sk-bad' : 'sk-work'); });
      s += P.text(155, 78, '危机', 'sk-t sk-small sk-bad-t') + P.arrow(168, 66, 156, 86, 'sk-thin');
      s += P.text(165, 166, 'GDP 好的年份，财力系数高，拨款多', 'sk-t sk-small');
      s += P.text(60, 26, '城市经济', 'sk-t sk-b', 'start');
      return wrap('城市经济', s);
    },
    bonds: function () {
      const P = pen('bonds');
      let s = P.rect(16, 50, 70, 56, 'sk-ink', 'sk-paper') + P.poly([[10, 50], [51, 28], [92, 50]], 'sk-ink') + P.text(51, 84, '发行债券', 'sk-t sk-b');
      s += P.arrow(92, 78, 140, 78) + P.coin(116, 66, 7);
      s += P.rect(146, 50, 74, 56, 'sk-ink', 'sk-gold') + P.text(183, 74, '建设专项', 'sk-t sk-b') + P.text(183, 92, '只能修地铁', 'sk-t sk-small');
      s += P.rect(176, 104, 14, 12, 'sk-ink', 'sk-paper') + '<path class="sk-ink" d="M179 104 v-5 a4 4 0 0 1 8 0 v5"/>';
      for (let i = 0; i < 4; i++) s += P.rect(236 + (i % 2) * 34, 40 + Math.floor(i / 2) * 40, 28, 30, 'sk-thin', 'sk-paper') + P.text(250 + (i % 2) * 34, 60 + Math.floor(i / 2) * 40, '%', 'sk-t sk-small');
      s += P.text(268, 134, '每年付息', 'sk-t sk-small') + P.text(160, 160, '3 或 6 年到期还本，利率发行时锁定', 'sk-t sk-small sk-muted');
      return wrap('债券融资', s);
    },
    overdue: function () {
      const P = pen('overdue');
      let s = P.poly([[60, 30], [100, 100], [20, 100]], 'sk-ink', 'sk-gold', true) + P.text(60, 88, '!', 'sk-t sk-big');
      s += P.text(60, 124, '还不上 → 逾期', 'sk-t sk-small') + P.text(60, 140, '每月加收费用', 'sk-t sk-small sk-muted');
      s += P.arrow(110, 70, 150, 70);
      s += P.circle(190, 70, 26, 'sk-ink', 'sk-bad') + P.text(190, 75, '✕', 'sk-t sk-b sk-white');
      s += P.text(190, 124, '先停城投债', 'sk-t sk-small') + P.text(190, 140, '满 6 个月停全部', 'sk-t sk-small sk-muted');
      s += P.arrow(226, 70, 254, 70) + P.coin(282, 70, 12) + P.text(282, 124, '有钱自动还清', 'sk-t sk-small');
      return wrap('还不上会怎样', s);
    },
    howto: function () {
      const P = pen('howto');
      let s = P.rect(20, 20, 280, 34, 'sk-ink', 'sk-paper') + P.rect(120, 26, 64, 22, 'sk-ink', 'sk-gold') + P.text(152, 41, '资金', 'sk-t sk-b');
      s += P.arrow(152, 56, 152, 82);
      s += P.rect(60, 84, 200, 80, 'sk-ink', 'sk-paper');
      ['概览', '经济', '财政', '融资'].forEach(function (t, i) { s += P.rect(66 + i * 48, 90, 44, 18, 'sk-thin', i === 3 ? 'sk-home' : null) + P.text(88 + i * 48, 103, t, 'sk-t sk-small'); });
      s += P.text(160, 136, '票价在「财政」页，发债在「融资」页', 'sk-t sk-small');
      return wrap('怎么操作', s);
    },
  };
  CM.Sketch = { draw: function (name, o) { return D[name] ? D[name](o) : ''; } };

  // ---------------- 乘客动态的随手涂鸦（v2.3 乘客之声） ----------------
  // 按话题画一张简笔配图，seed 固定笔触（同一条动态每次一样），o 为站名、距离等文字
  const n1 = function (v) { return (Math.round(v * 10) / 10).toString(); };
  const man = function (P, x, y, mood, bag) {   // 简笔小人，脚在 y；mood：sad / happy
    let s = P.circle(x, y - 27, 6, 'sk-ink', 'sk-paper') + P.line(x, y - 21, x, y - 9, 'sk-ink', 0.6) + P.line(x, y - 9, x - 5, y, 'sk-ink', 0.6) + P.line(x, y - 9, x + 5, y, 'sk-ink', 0.6) + P.line(x - 7, y - 18, x + 7, y - 15, 'sk-ink', 0.6);
    if (mood) s += '<path class="sk-ink" d="M' + n1(x - 3) + ' ' + n1(y - 24.5) + (mood === 'happy' ? ' q3 3 6 0' : ' q3 -2.5 6 0') + '"/>';
    if (bag) s += P.rect(x + 7, y - 13, 8, 10, 'sk-thin', 'sk-gold');
    return s;
  };
  const sign = function (P, x, y) { return P.line(x, y, x, y - 34, 'sk-ink') + P.circle(x, y - 42, 10, 'sk-ink', 'sk-metro-f') + P.text(x, y - 38, 'M', 'sk-t sk-b sk-white'); };
  const car = function (P, x, y, w) { w = w || 34; return P.rect(x, y, w, 12, 'sk-ink', 'sk-car') + P.rect(x + 6, y - 7, w - 14, 7, 'sk-thin') + P.circle(x + 8, y + 13, 3, 'sk-ink') + P.circle(x + w - 8, y + 13, 3, 'sk-ink'); };
  const sparkle = function (P, x, y, r) { return P.line(x - r, y, x + r, y, 'sk-ink', 0.4) + P.line(x, y - r, x, y + r, 'sk-ink', 0.4); };
  const DOODLE = {
    crowd: function (P, o) {
      let s = P.rect(30, 34, 260, 92, 'sk-ink', 'sk-paper') + P.rect(30, 110, 260, 8, 'sk-thin', 'sk-metro-f') + P.circle(70, 132, 6, 'sk-ink') + P.circle(250, 132, 6, 'sk-ink');
      for (let i = 0; i < 20; i++) { const x = 48 + (i % 10) * 25 + (i >= 10 ? 12 : 0), y = i < 10 ? 66 : 90; s += P.circle(x, y, 9, 'sk-ink', 'sk-home') + P.line(x - 10, y + 16, x + 10, y + 16, 'sk-thin', 0.5); }
      s += P.text(272, 26, '!!', 'sk-t sk-b sk-bad-t') + '<path class="sk-thin" d="M286 50 q3 5 0 8 q-3 -3 0 -8"/>';
      return s + P.text(160, 162, (o.s ? o.s + ' · ' : '') + '早高峰 8:15', 'sk-t sk-small');
    },
    xfer: function (P, o) {
      let s = P.circle(48, 70, 20, 'sk-ink', 'sk-metro-f') + P.text(48, 75, 'M', 'sk-t sk-b sk-white') + P.circle(272, 70, 20, 'sk-ink', 'sk-metro-f') + P.text(272, 75, 'M', 'sk-t sk-b sk-white');
      s += '<path class="sk-ink" stroke-dasharray="3 6" d="M68 80 C 110 150, 140 10, 178 92 S 236 132, 252 82"/>';
      s += man(P, 160, 152, 'sad', true) + P.text(160, 34, (o.m || '400') + ' m', 'sk-t sk-b sk-accent');
      return s + P.text(48, 106, o.s || '', 'sk-t sk-small') + P.text(272, 106, o.t || '', 'sk-t sk-small');
    },
    level: function (P) {
      let s = '', x = 70, y = 40; const pts = [[40, 40]];
      for (let i = 0; i < 6; i++) { pts.push([x, y]); y += 18; pts.push([x, y]); x += 30; }
      s += P.poly(pts.concat([[300, y]]), 'sk-ink');
      s += P.text(22, 60, 'B1', 'sk-t sk-small') + P.text(22, 100, 'B2', 'sk-t sk-small') + P.text(22, 140, 'B3', 'sk-t sk-small');
      return s + man(P, 56, 40, 'sad', true) + P.arrow(150, 40, 220, 80, 'sk-thin') + P.text(250, 40, '还要走多久…', 'sk-t sk-small');
    },
    cover: function (P) {
      let s = '';
      for (let i = 0; i < 4; i++) s += P.house(18 + (i % 2) * 28, 92 + Math.floor(i / 2) * 24 - (i % 2) * 6, 1.2);
      s += '<path class="sk-thin" stroke-dasharray="2 7" d="M86 140 Q 160 120, 270 140"/>' + sign(P, 280, 140);
      s += P.circle(176, 62, 16, 'sk-ink', 'sk-paper') + P.line(176, 62, 176, 51, 'sk-ink', 0.3) + P.line(176, 62, 185, 66, 'sk-ink', 0.3) + P.text(176, 100, '步行 20+ 分钟', 'sk-t sk-small');
      return s + man(P, 98, 136, 'sad');
    },
    newst: function (P, o) {
      let s = P.rect(96, 70, 110, 64, 'sk-ink', 'sk-paper') + P.poly([[88, 70], [151, 46], [214, 70]], 'sk-ink', 'sk-metro-f', true) + P.rect(134, 96, 34, 38, 'sk-thin', 'sk-work') + P.text(151, 64, 'M', 'sk-t sk-b sk-white');
      s += sparkle(P, 70, 50, 7) + sparkle(P, 236, 40, 9) + sparkle(P, 226, 92, 5) + sparkle(P, 60, 110, 5);
      return s + man(P, 252, 150, 'happy') + P.text(150, 166, (o.s ? o.s + '站 · ' : '') + '开通啦', 'sk-t sk-b sk-accent');
    },
    road: function (P, o) {
      let s = P.rect(0, 112, 320, 34, 'sk-thin', 'sk-road');
      for (let i = 0; i < 7; i++) s += car(P, 6 + i * 44, 120, 34);
      s += P.text(60, 92, '#!@', 'sk-t sk-b sk-bad-t') + P.circle(250, 54, 34, 'sk-thin', 'sk-paper') + P.circle(210, 98, 5, 'sk-thin', 'sk-paper') + P.circle(200, 108, 3, 'sk-thin') + P.train(222, 46, 56);
      return s + P.text(110, 30, o.r || '', 'sk-t sk-small');
    },
    roadok: function (P) {
      let s = P.rect(0, 128, 320, 30, 'sk-thin', 'sk-road') + car(P, 60, 136, 34) + car(P, 210, 136, 34);
      s += P.line(0, 82, 320, 82, 'sk-ink') + P.line(70, 82, 70, 126, 'sk-thin') + P.line(250, 82, 250, 126, 'sk-thin') + P.train(120, 62, 84);
      return s + P.circle(280, 32, 13, 'sk-ink', 'sk-gold') + P.line(100, 70, 86, 70, 'sk-thin', 0.4) + P.line(100, 76, 80, 76, 'sk-thin', 0.4);
    },
    fac: function (P, o) {
      let s = P.rect(30, 52, 92, 92, 'sk-ink', 'sk-work') + P.rect(64, 110, 24, 34, 'sk-thin', 'sk-paper');
      s += P.rect(66, 62, 20, 20, 'sk-thin', 'sk-paper') + P.text(76, 77, '?', 'sk-t sk-b');
      s += '<path class="sk-thin" stroke-dasharray="2 7" d="M128 140 Q 200 110, 262 140"/>' + sign(P, 272, 140) + P.text(196, 80, '???', 'sk-t sk-b sk-muted');
      return s + P.text(76, 166, o.x || '', 'sk-t sk-small');
    },
    fare: function (P, o) {
      let s = '';
      for (let i = 0; i < 5; i++) s += P.coin(80 + (i % 2) * 3, 140 - i * 16, 13);
      s += P.rect(150, 70, 90, 50, 'sk-ink', 'sk-paper') + P.line(170, 70, 170, 120, 'sk-thin') + P.text(205, 100, '¥ ' + (o.f || ''), 'sk-t sk-b');
      return s + man(P, 274, 150, 'sad');
    },
    line: function (P, o) {
      let s = P.line(10, 120, 310, 120, 'sk-ink') + P.train(110, 96, 110);
      for (let i = 0; i < 3; i++) s += P.line(40 + i * 8, 100 + i * 7, 96, 100 + i * 7, 'sk-thin', 0.4);
      s += '<path class="sk-ink sk-heart" d="M160 64 c -16 -14 -30 -2 -22 10 l 22 18 l 22 -18 c 8 -12 -6 -24 -22 -10z"/>';
      return s + man(P, 270, 150, 'happy') + P.text(160, 160, o.l || '', 'sk-t sk-small sk-accent');
    },
  };
  DOODLE.linecrowd = DOODLE.crowd; DOODLE.impact = DOODLE.roadok;
  CM.Sketch.doodle = function (kind, seed, o) {
    const fn = DOODLE[kind]; if (!fn) return '';
    return wrap('配图', fn(pen('dd' + seed), o || {}));
  };


  // ---------------- 图文分页 ----------------
  // slides：[{ sketch, title, lines: [...], note }]；← → 键翻页，Esc 关闭；最后一页按钮为「完成」
  CM.UI.prototype.showSlides = function (title, slides, opts) {
    opts = opts || {};
    const self = this; let k = 0;
    const close = function (done) { document.removeEventListener('keydown', key, true); self.closeScreen(); if (opts.onClose) opts.onClose(!!done); };
    const pic = h('div', { class: 'sl-pic' }), head = h('h3', { class: 'sl-title' }), list = h('ul', { class: 'sl-lines' }), note = h('div', { class: 'sl-note tiny muted' });
    const dots = h('div', { class: 'sl-dots' }), prev = h('button', { class: 'btn sm ghost', onclick: function () { go(k - 1); } }, ic('arrowL', 14), '上一页');
    const next = h('button', { class: 'btn sm primary', onclick: function () { if (k >= slides.length - 1) close(true); else go(k + 1); } });
    const count = h('span', { class: 'tiny muted' });
    slides.forEach(function (s, i) { dots.appendChild(h('button', { 'aria-label': '第 ' + (i + 1) + ' 页', onclick: function () { go(i); } })); });
    const go = function (i) {
      const dir = i >= k ? 1 : -1; k = U.clamp(i, 0, slides.length - 1);
      const s = slides[k];
      pic.innerHTML = CM.Sketch.draw(s.sketch, s.o);
      pic.classList.remove('in-l', 'in-r'); void pic.offsetWidth; pic.classList.add(dir > 0 ? 'in-r' : 'in-l');
      head.textContent = s.title;
      list.innerHTML = ''; for (const t of s.lines) list.appendChild(h('li', null, t));
      note.textContent = s.note || '';
      Array.from(dots.children).forEach(function (d, j) { d.classList.toggle('on', j === k); });
      prev.disabled = k === 0; next.innerHTML = ''; next.append(k >= slides.length - 1 ? (opts.doneLabel || '完成') : '下一页', ic(k >= slides.length - 1 ? 'check' : 'arrowR', 14));
      count.textContent = (k + 1) + ' / ' + slides.length;
      if (CM.I18n) CM.I18n.localize(card);
    };
    const key = function (e) { if (e.key === 'ArrowRight') { e.preventDefault(); if (k < slides.length - 1) go(k + 1); } else if (e.key === 'ArrowLeft') { e.preventDefault(); go(k - 1); } };
    const card = h('div', { class: 'card sl-card' },
      h('div', { class: 'card-head' }, h('span', { class: 'badge b-gold' }, ic(opts.icon || 'coin')), h('div', { class: 'grow' }, h('h2', null, title), h('div', { class: 'tiny muted' }, opts.sub || '')), h('button', { class: 'iconbtn', 'data-tip': '关闭', 'data-key': 'Esc', onclick: function () { close(false); } }, ic('close'))),
      pic, head, list, note,
      h('div', { class: 'sl-foot' }, prev, dots, count, next));
    this.openScreen(card, function () { close(false); }, 'sl-screen');
    document.addEventListener('keydown', key, true);
    go(0);
  };
})(window.CM);
