'use strict';
// 城市总评（v2.7）：史料阶段结束、进入模拟阶段时自动生成一次，按覆盖、客流、道路、运营、满意度、财政和目标打分并给出评级。
// 之后可以继续游戏；总评（连同当时的线路图缩略图）只随存档保存，存档删了总评也就没了，不另记历次总评；
// 可以在「城市统计 → 城市总评」再次查看，海报可导出为图片。分数只用当前模拟结果计算，不影响游戏数值。
(function (CM) {
  const U = CM.U, h = U.h, ic = CM.icon;
  const T = function (s) { return CM.I18n ? CM.I18n.text(String(s)) : String(s); };
  const clamp01 = function (v) { return U.clamp(v, 0, 1); };
  const GRADE = {
    S: { color: '#c8961e', title: '世界级的地铁之城' },
    A: { color: '#2f8f5b', title: '成熟的轨道都市' },
    B: { color: '#2f6fa8', title: '稳步成网的城市' },
    C: { color: '#c77d1f', title: '仍在追赶的城市' },
    D: { color: '#b4483c', title: '地铁还没有成为主角' },
  };
  const gradeOf = function (s) { return s >= 88 ? 'S' : s >= 76 ? 'A' : s >= 62 ? 'B' : s >= 45 ? 'C' : 'D'; };
  const GOOD = { cover: '线网已经走到大多数市民身边', share: '地铁成了市民出行的主力', road: '高峰时道路依然比较顺畅', ops: '列车和车站的运力都跟得上', sat: '市民对交通很满意', fin: '票款和商业基本能撑起运营', goal: '定下的目标大多完成了' };
  const WEAK = { cover: '还有不少市民步行走不到地铁', share: '乘地铁的人还不够多，可以加密换乘、提高速度或调整票价', road: '高峰道路还很拥堵，主要走廊值得再加一条线', ops: '部分线路和车站长期拥挤，可以加车、升级车站或修平行线', sat: '市民还不太满意，通勤时间和拥挤是主要原因', fin: '运营收支和债务压力较大', goal: '不少任务没有完成' };

  // ---------- 打分 ----------
  function compute(g) {
    const CFG = CM.CFG, m = g.model, D = m.daily || {}, E = g.econ, free = E.isFree(), C = g.compiled, net = g.net;
    const cover = D.coverage || 0, share = D.metroShare || 0, cong = D.congAM || D.cong || 1, crowd = D.crowdShare || 0, sat = E.sat || 0;
    let km = 0; if (C && C.segs) C.segs.forEach(function (cs) { if (cs.g) km += cs.g.lenM / 1000; });
    let over = 0, nSt = 0; const sd = m.stDailyWk;
    if (C && sd) C.stations.forEach(function (s, i) { if (i < sd.peak.length) { nSt++; if (sd.peak[i] / CFG.metro.stationCap[s.size] > 1) over++; } });
    const dims = [
      { k: 'cover', name: '线网覆盖', w: 20, score: 100 * Math.pow(clamp01(cover / 0.75), 0.8), val: '步行 15 分钟可达地铁的人口 ' + Math.round(cover * 100) + '%' },
      { k: 'share', name: '客运分担', w: 25, score: 100 * (1 - Math.exp(-share / 0.13)), val: '出行中乘地铁的比例 ' + (share * 100).toFixed(1) + '%' },
      { k: 'road', name: '道路畅通', w: 13, score: 100 * clamp01((1.8 - cong) / 0.7), val: '早高峰拥堵指数 ' + cong.toFixed(2) },
      { k: 'ops', name: '运营质量', w: 10, score: 70 * (1 - clamp01(crowd / 0.22)) + 30 * (1 - clamp01((nSt ? over / nSt : 0) / 0.12)), val: '拥挤乘车占 ' + Math.round(crowd * 100) + '% · 超负荷车站 ' + over + ' 座' },
      { k: 'sat', name: '市民满意', w: 14, score: clamp01(sat / 100) * 100, val: '满意度 ' + Math.round(sat) + ' 分' },
    ];
    if (!free) {
      const L = E.ledger.slice(-12), Tk = CM.Tasks, rec = L.length && Tk ? L.reduce(function (a, r) { return a + Tk.recoveryOf(r); }, 0) / L.length : 0, income = L.reduce(function (a, r) { return a + (r.fare || 0) + (r.commerce || 0); }, 0), debt = E.debtTotal(), ratio = debt / Math.max(1, income);
      dims.push({ k: 'fin', name: '财政健康', w: 12, score: 60 * clamp01(rec) + 40 * (1 - clamp01(ratio / 12)) - (E.funds < 0 ? 15 : 0), val: '票款和商业覆盖运营 ' + Math.round(rec * 100) + '% · 负债 ' + U.fmtMoney(debt) });
      const done = g.tasks.done.length, failed = g.tasks.failed.length;
      dims.push({ k: 'goal', name: '目标达成', w: 6, score: done + failed ? 100 * done / (done + failed) : 50, val: '完成任务 ' + done + ' 项 · 未完成 ' + failed + ' 项' });
    }
    for (const d of dims) d.score = Math.round(U.clamp(d.score, 0, 100));
    const W = dims.reduce(function (a, d) { return a + d.w; }, 0), score = Math.round(dims.reduce(function (a, d) { return a + d.score * d.w; }, 0) / W), grade = gradeOf(score);
    const sorted = dims.slice().sort(function (a, b) { return b.score - a.score; }), best = sorted[0], worst = sorted[sorted.length - 1];
    const comment = GOOD[best.k] + '。' + (worst.score < 70 ? WEAK[worst.k] + '。' : '各方面都比较均衡。');
    let first = null; for (const id in net.segments) { const b = net.segments[id].built; if (b && (!first || b[0] + b[1] / 12 < first[0] + first[1] / 12)) first = b; }
    let lines = 0; for (const lid in net.lines) if (CM.Metro.lineTopo(net, lid).topo !== 'empty') lines++;
    const stations = Object.keys(net.stations).filter(function (sid) { return CM.Metro.stationLines(net, sid).length; }).length;
    const stats = [['总评线路', lines, 'tiao'], ['总评车站', stations, 'zuo'], ['线路总长', km.toFixed(0) + ' km'], ['日均客流', U.fmtPeople(D.metro || 0)], ['地铁分担率', (share * 100).toFixed(1) + '%'], ['人口覆盖', Math.round(cover * 100) + '%'], ['平均通勤', (D.commute || 0).toFixed(1), 'min'], ['总评满意度', Math.round(sat), 'fen']];
    if (E.built) stats.push(['累计建设投入', U.fmtMoney(E.built)]);
    const H = g.history.filter(function (r) { return r && r.m === 1; }), step = Math.max(1, Math.ceil(H.length / 40)), trend = [];
    for (let i = 0; i < H.length; i += step) trend.push([H[i].y, +(H[i].share || 0).toFixed(4)]);
    trend.push([g.clock.y, +share.toFixed(4)]);
    return { paper: CM.NetMap && CM.NetMap.paper ? CM.NetMap.paper() : '#fff', id: g.id, map: g.mapId, city: CM.DATA.city || '', game: g.name || '', mode: E.mode, from: first ? first[0] : g.clock.y, at: [g.clock.y, g.clock.m], score: score, grade: grade, title: GRADE[grade].title, comment: comment, dims: dims.map(function (d) { return { k: d.k, name: d.name, score: d.score, val: d.val }; }), stats: stats, trend: trend, ver: CFG.GAME_VERSION, when: Date.now() };
  }

  // ---------- 卡片 ----------
  const UNIT = { tiao: [' 条', ''], zuo: [' 座', ''], min: [' 分钟', ' min'], fen: [' 分', ''] };
  const statText = function (s) { const u = s[2] && UNIT[s[2]]; return String(s[1]) + (u ? u[CM.I18n && CM.I18n.get() === 'en' ? 1 : 0] : ''); };
  const statName = function (n) { return n.replace('总评', ''); };
  const spark = function (trend, color) {
    if (!trend || trend.length < 2) return null;
    const W = 320, H = 72, ys = trend.map(function (p) { return p[1]; }), mx = Math.max(0.01, Math.max.apply(null, ys)), n = trend.length - 1, x = function (i) { return 2 + (W - 4) * i / n; }, y = function (v) { return H - 3 - (H - 8) * v / mx; };
    const d = trend.map(function (p, i) { return (i ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(p[1]).toFixed(1); }).join('');
    return h('div', { class: 'rv-trend' }, h('div', { class: 'rv-trend-h' }, h('span', null, '地铁分担率的变化'), h('small', null, trend[0][0] + '–' + trend[n][0] + ' · 最高 ' + (mx * 100).toFixed(1) + '%')),
      h('div', { html: '<svg viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none" width="100%" height="' + H + '"><path d="' + d + 'L' + x(n).toFixed(1) + ' ' + H + 'L' + x(0).toFixed(1) + ' ' + H + 'Z" fill="' + color + '" opacity=".14"/><path d="' + d + '" fill="none" stroke="' + color + '" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"/></svg>' }));
  };
  function body(rec, thumb) {
    const G = GRADE[rec.grade] || GRADE.B;
    const left = h('div', { class: 'rv-left' },
      h('div', { class: 'rv-hero' },
        h('div', { class: 'rv-grade', style: { color: G.color, borderColor: G.color } }, rec.grade),
        h('div', { class: 'grow' }, h('div', { class: 'rv-score' }, h('b', null, String(rec.score)), h('small', null, ' / 100')), h('div', { class: 'rv-title' }, rec.title))),
      h('p', { class: 'rv-comment' }, rec.comment),
      h('div', { class: 'rv-dims' }, rec.dims.map(function (d) {
        return h('div', { class: 'rv-dim' }, h('div', { class: 'rv-dim-h' }, h('b', null, d.name), h('span', null, String(d.score))), h('div', { class: 'rv-bar' }, h('i', { style: { width: d.score + '%', background: G.color } })), h('small', null, d.val));
      })));
    const right = h('div', { class: 'rv-right' },
      thumb ? h('div', { class: 'rv-thumb' }, h('img', { src: thumb, alt: '' })) : null,
      h('div', { class: 'rv-stats' }, rec.stats.map(function (s) { return h('div', { class: 'rv-stat' }, h('small', { 'data-k': s[0] }, statName(s[0])), h('b', null, statText(s))); })),
      spark(rec.trend, G.color));
    return h('div', { class: 'rv-body' }, left, right);
  }
  // 总评卡片：onBack 为空时点继续就关闭界面
  function show(rec, thumb, onBack, first) {
    const ui = CM.ui, back = function () { if (onBack) onBack(); else ui.closeScreen(); };
    const exportBtn = h('button', { class: 'btn', onclick: function () { poster(rec, thumb, exportBtn); } }, ic('export', 14), h('span', { class: 'rv-export-t' }, '导出海报'));
    const card = h('div', { class: 'card rv-card' },
      h('div', { class: 'card-head' }, h('span', { class: 'badge b-gold' }, ic('star')), h('div', { class: 'grow' }, h('h2', null, '城市总评 · ' + rec.city), h('div', { class: 'tiny muted' }, rec.from + ' 年至 ' + rec.at[0] + ' 年 ' + rec.at[1] + ' 月' + (first ? ' · 史料阶段到此结束，之后是模拟的未来' : ''))), h('button', { class: 'iconbtn', 'data-tip': '关闭', 'data-key': 'Esc', onclick: back }, ic('close'))),
      h('div', { class: 'rv-scroll' }, body(rec, thumb)),
      h('div', { class: 'modal-actions' }, first ? h('span', { class: 'tiny muted grow' }, '总评随存档保存，之后可以在「城市统计 → 城市总评」再次查看') : h('span', { class: 'grow' }), exportBtn, h('button', { class: 'btn primary', onclick: back }, first ? '继续游戏' : '返回')));
    ui.openScreen(card, back, 'rv-screen');
  }
  // ---------- 海报 ----------
  function poster(rec, thumb, btn) {
    const ui = CM.ui, label = btn && btn.querySelector('.rv-export-t'), busy = function (on) { if (!btn) return; btn.disabled = on; if (label) label.textContent = on ? '正在导出…' : '导出海报'; };
    busy(true);
    const done = function (err) { busy(false); if (err) ui.toast('导出失败：' + err, 'bad'); };
    const draw = function (img) {
      try {
        const G = GRADE[rec.grade] || GRADE.B, W = 1600, M0 = 80, font = getComputedStyle(document.body).fontFamily || 'sans-serif';
        // 线网图完整放进画面：高度超过上限时按比例缩小，左右留白
        const iw = W - 2 * M0, fit = img ? Math.min(iw / img.width, 1240 / img.height) : 0, dw = img ? img.width * fit : 0, ih = img ? img.height * fit : 0, dimRows = rec.dims.length, statRows = Math.ceil(rec.stats.length / 2);
        const top = 300, midY = top + (img ? ih + 60 : 20), lower = Math.max(dimRows * 92, statRows * 112), HH = midY + lower + 170;
        const cv = document.createElement('canvas'); cv.width = W; cv.height = Math.round(HH);
        const c = cv.getContext('2d');
        c.fillStyle = '#f6f8fb'; c.fillRect(0, 0, W, HH);
        c.fillStyle = '#16233a'; c.fillRect(0, 0, W, 260);
        c.textBaseline = 'alphabetic'; c.textAlign = 'left';
        c.fillStyle = '#9fb4d1'; c.font = '500 30px ' + font; c.fillText(T('城市总评'), M0, 84);
        c.fillStyle = '#fff'; c.font = '800 84px ' + font; c.fillText(T(rec.city), M0, 176);
        c.fillStyle = '#c8d5e8'; c.font = '400 28px ' + font; c.fillText(T(rec.from + ' 年至 ' + rec.at[0] + ' 年 ' + rec.at[1] + ' 月'), M0, 224);
        const gx = W - M0 - 90, gy = 130;
        c.beginPath(); c.arc(gx, gy, 90, 0, 7); c.fillStyle = '#fff'; c.fill(); c.lineWidth = 8; c.strokeStyle = G.color; c.stroke();
        c.fillStyle = G.color; c.textAlign = 'center'; c.font = '800 96px ' + font; c.fillText(rec.grade, gx, gy + 34);
        c.textAlign = 'right'; c.fillStyle = '#fff'; c.font = '800 72px ' + font; c.fillText(String(rec.score), gx - 120, 150);
        c.fillStyle = '#c8d5e8'; c.font = '400 26px ' + font; c.fillText(T(rec.title), gx - 120, 196); c.textAlign = 'left';
        if (img) { c.fillStyle = rec.paper || '#fff'; c.fillRect(M0 - 10, top - 10, iw + 20, ih + 20); c.drawImage(img, (W - dw) / 2, top, dw, ih); }
        // 各项评分
        let y = midY; const colW = (W - 2 * M0 - 60) / 2;
        rec.dims.forEach(function (d) {
          c.fillStyle = '#1f2a3a'; c.font = '700 28px ' + font; c.fillText(T(d.name), M0, y + 28);
          c.textAlign = 'right'; c.fillStyle = G.color; c.font = '800 30px ' + font; c.fillText(String(d.score), M0 + colW, y + 28); c.textAlign = 'left';
          c.fillStyle = '#e3e8ef'; c.fillRect(M0, y + 42, colW, 10); c.fillStyle = G.color; c.fillRect(M0, y + 42, colW * d.score / 100, 10);
          c.fillStyle = '#5d6b80'; c.font = '400 21px ' + font; c.fillText(T(d.val), M0, y + 78);
          y += 92;
        });
        // 数字
        const sx = M0 + colW + 60, sw = (colW - 24) / 2;
        rec.stats.forEach(function (s, i) {
          const x = sx + (i % 2) * (sw + 24), yy = midY + Math.floor(i / 2) * 112;
          c.fillStyle = '#fff'; c.fillRect(x, yy, sw, 96);
          c.fillStyle = '#5d6b80'; c.font = '400 22px ' + font; c.fillText(CM.I18n && CM.I18n.get() === 'en' ? T(s[0]) : T(statName(s[0])), x + 18, yy + 34);
          c.fillStyle = '#1f2a3a'; c.font = '800 32px ' + font; c.fillText(statText(s), x + 18, yy + 76);
        });
        // 评语与落款
        const fy = HH - 96;
        c.fillStyle = '#1f2a3a'; c.font = '500 26px ' + font;
        const words = Array.from(T(rec.comment)); let row = '', ry = fy - 10, rows = 0;
        for (const ch of words) { if (c.measureText(row + ch).width > W - 2 * M0) { c.fillText(row, M0, ry); ry += 36; row = ''; rows++; if (rows >= 1) break; } row += ch; }
        if (row) c.fillText(row, M0, ry);
        c.fillStyle = '#9aa5b5'; c.font = '400 22px ' + font; c.fillText(T('《城市与地铁》') + (rec.game ? ' · ' + rec.game : ''), M0, HH - 28);
        cv.toBlob(function (blob) {
          if (!blob) { done('无法生成图片'); return; }
          const name = '城市总评-' + rec.city + '-' + rec.at[0] + '年.png';
          try { U.downloadBlob(blob, name); ui.toast('已导出城市总评海报', 'good'); done(); } catch (e) { done(e.message || '无法保存图片'); }
        }, 'image/png');
      } catch (err) { console.error(err); done('无法绘制海报'); }
    };
    if (!thumb) { draw(null); return; }
    const im = new Image(); im.onload = function () { draw(im); }; im.onerror = function () { draw(null); }; im.src = thumb;
  }
  // ---------- 触发 ----------
  function dueNow(g) {
    if (!g || !g.model || g.preview || g.tutorial || g.cityReview || !g.econ || g.econ.failed) return false;
    const mp = CM.MAPS[g.mapId]; if (!mp || mp.kind !== 'real') return false;
    if (g.clock.y <= CM.CFG.growth.histEnd) return false;
    for (const lid in g.net.lines) if (CM.Metro.lineTopo(g.net, lid).topo !== 'empty') return true;
    return false;
  }
  let running = false, pending = null;
  function showPending() {
    if (!pending) return false;
    const p = pending, g = p.g, ui = p.ui;
    if (CM.game !== g || CM.ui !== ui || g.cityReview !== p.rec || g.econ.failed) { pending = null; return false; }
    if (!ui.blocking() && !g.jumping && !g.pending) { pending = null; show(p.rec, p.rec.thumb, null, true); }
    return true;
  }
  function trigger(g, ui) {
    running = true;
    ui.setSpeed(0);
    const rec = compute(g);
    g.cityReview = rec;
    g.logEvent({ tag: '经营', title: '城市总评：' + rec.grade + ' 级，' + rec.score + ' 分', desc: rec.title + '。' + rec.comment });
    // 当时的线路图缩略图跟总评一起存进存档（不另存本机）
    const finish = function (thumb) { running = false; rec.thumb = thumb || null; if (CM.game === g) { ui.markUnsaved(); pending = { g: g, ui: ui, rec: rec }; showPending(); } };
    if (CM.NetMap && CM.NetMap.snapshot) CM.NetMap.snapshot(1440).then(finish, function () { finish(null); }); else finish(null);
  }
  setInterval(function () {
    try {
      if (showPending() || running) return;
      const g = CM.game, ui = CM.ui;
      if (!ui || !dueNow(g) || ui.blocking() || g.jumping || g.pending || !g.model.trafficReady() || !g.model.settled) return;
      trigger(g, ui);
    } catch (e) { running = false; console.error(e); }
  }, 900);

  // ---------- 查看 ----------
  const Review = {
    compute: compute, due: dueNow,
    show: function (rec, onBack) { show(rec, rec.thumb || null, onBack, false); },
    poster: poster,
    // 城市统计里的「城市总评」页：只有本局（本存档）的总评
    page: function (g, el) {
      const rec = g && g.cityReview;
      if (rec) {
        const thumb = rec.thumb || null, exportBtn = h('button', { class: 'btn sm', onclick: function () { poster(rec, thumb, exportBtn); } }, ic('export', 14), h('span', { class: 'rv-export-t' }, '导出海报'));
        el.appendChild(h('div', { class: 'rv-pagehead' }, h('div', { class: 'grow' }, h('h3', null, '本局总评 · ' + rec.city), h('small', { class: 'muted' }, rec.from + ' 年至 ' + rec.at[0] + ' 年 ' + rec.at[1] + ' 月')), exportBtn));
        el.appendChild(body(rec, thumb));
      } else {
        el.appendChild(h('div', { class: 'rv-empty' }, ic('star', 28), h('b', null, '本局还没有总评'), h('small', null, g && g.tutorial ? '新手教程没有总评。' : '城市进入模拟阶段（' + (CM.CFG.growth.histEnd + 1) + ' 年 1 月）时会自动生成。')));
      }
    },
  };
  CM.Review = Review;
})(window.CM);
