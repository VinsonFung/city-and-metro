'use strict';
// 列车跟随模式：点击地图上行驶的列车，镜头平滑跟随它运行；底部卡片显示线路、方向、下一站、速度与所处位置
// （地下 / 地面 / 高架、跨江、停站）。进入地下区间时自动切换到地下视图。H 隐藏界面（只留一行字幕），Esc 或拖动地图退出。
(function (CM) {
  const AX = CM.Accessibility;
  const U = CM.U, h = U.h, CFG = CM.CFG;
  const ic = function (n, s) { return CM.icon(n, s); };
  const snd = function (n) { if (CM.Sound) CM.Sound.play(n); };
  let ui = null, R = null, t = null, card = null, el = null, under0 = 0, autoUnder = false, lastInfo = 0, lineId = null, routeR = -1;
  const TYPE = { underground: '地下', surface: '地面', elevated: '高架' };

  function trains() { return CM.agents ? CM.agents.trains : []; }
  // 当前位置信息
  function info() {
    const A = CM.agents, net = A.netRef, g = CM.game;
    if (!t || !t.g || !net || !g) return null;
    const rt = t.g.rt, L = t.g.legs[t.leg], n = rt.stIdx.length, C = net.C;
    const pos = A.trainPos(t, {}), p = {};
    U.posAt(rt.pts, rt.cum, pos.d, p);
    const nextIdx = rt.loop ? (L.rev ? rt.stIdx[L.k] : rt.stIdx[(L.k + 1) % n]) : (L.rev ? rt.stIdx[L.k] : rt.stIdx[L.k + 1]);
    const prevIdx = rt.loop ? (L.rev ? rt.stIdx[(L.k + 1) % n] : rt.stIdx[L.k]) : (L.rev ? rt.stIdx[L.k + 1] : rt.stIdx[L.k]);
    const term = rt.loop ? null : C.stations[L.rev ? rt.stIdx[0] : rt.stIdx[n - 1]];
    const seg = rt.segRefs[L.k], sd = seg && C.segs.get(seg.id), type = sd ? sd.seg.type : 'underground';
    const hh = A.heightAt(rt, p);
    const v = A.trainSpeed(t);
    const dwell = t.t >= L.T, hold = t.t < 0;
    const water = g.city.waterAt(p.x, p.y) ? g.city.riverNameAt(p.x, p.y) : null;
    const rg = g.city.regionAt(p.x, p.y);
    let lf = 0;
    const model = g.model, W = A.W, f = W ? model.freqAt(t.g.r, W, rt.loop ? (L.rev ? 1 : 0) : null) : 0, capR = model.capOf(t.g.r, net);
    if (f > 0 && net.rideEdge[t.g.r]) lf = model.edgeLoadAt(net.rideEdge[t.g.r][2 * L.k + (L.rev ? 1 : 0)], W) / (f * capR);
    // 本列车的定员（v2.5 车队：按它的车型与编组）；车上人数按区间平均每列载客
    const capT = t.mdl ? t.mdl.cap * (t.cars || rt.cars) : rt.cap;
    return {
      x: p.x, y: p.y, h: hh, rt: rt, line: rt.line, type: type, v: v, dwell: dwell, hold: hold, water: water,
      next: C.stations[nextIdx], prev: C.stations[prevIdx], term: term, loopDir: rt.loop ? (t.g.dir === 0 ? '顺行' : '逆行') : null,
      toNext: Math.abs(L.d1 - pos.d) * CFG.CELL_M, region: rg ? rg.name.replace(/（.*）/, '') : '', lf: capT > 0 ? lf * capR / capT : lf, cars: t.cars || rt.cars,
      pax: lf * capR, cap: capT, model: t.mdl ? CM.Fleet.shortOf(t.mdl) + ' · ' + (t.cars || rt.cars) + ' 节' : null,
    };
  }
  const stn = function (s) { return /站$/.test(s.name) ? s.name : s.name + '站'; };
  // 车上人数（v2.4 玩家反馈：看不出每列车坐了多少人）：本区间的断面客流 ÷ 发车频率，百人以上取整到十位
  const paxNum = function (o) { const n = Math.round(o.pax); return U.fmtInt(n >= 100 ? Math.round(n / 10) * 10 : n); };
  const paxText = function (o) { return o.lf > 0 ? '车上约 ' + paxNum(o) + ' 人 · 定员 ' + U.fmtInt(o.cap) + ' 人（满载率 ' + U.fmtPct(o.lf, 0) + '）' : '车上乘客很少'; };
  function statusText(o) {
    if (o.hold) return '在' + stn(o.prev) + '等候发车';
    if (o.dwell) return '停靠' + stn(o.next);
    if (o.water) return (o.type === 'underground' ? '在' + o.water + '江底隧道中穿行' : '正在跨越' + o.water + (o.type === 'elevated' ? '（高架桥）' : '（桥梁）'));
    const where = o.type === 'underground' ? '地下区间' : (o.type === 'elevated' ? '高架区间' : '地面区间');
    return '驶向' + stn(o.next) + ' · ' + where + (o.region ? ' · ' + o.region : '');
  }
  // 卡片只建一次，之后每 0.25 秒只改文字与显隐（v2.3）：以前每次整张重建，悬停中的按钮被替换，
  // 指针下的元素不断更换，按钮的悬停样式与提示随之闪烁抽动，点击也可能落空
  function build() {
    const txt = function (cls) { return h('span', { class: cls }); };
    el = { num: txt('fc-num'), line: txt('fc-line'), dir: txt('fc-dir'), paused: h('span', { class: 'tag', style: { display: 'none' } }, '已暂停'), status: h('div', { class: 'fc-status' }),
      next: h('b'), speed: h('b'), type: h('b'), lf: h('b') };
    el.under = h('button', { class: 'btn sm ghost', onclick: function () { autoUnder = !autoUnder; if (!autoUnder) setUnder(under0); el.under.textContent = autoUnder ? '自动地下视图：开' : '自动地下视图：关'; localize(el.under); } });
    el.play = h('button', { class: 'btn sm', style: { display: 'none' }, onclick: function () { ui.togglePause(); } }, ic('play', 14), '继续');
    card.replaceChildren(
      h('div', { class: 'fc-head' }, el.num, el.line, el.dir, h('span', { class: 'grow' }), el.paused),
      el.status,
      h('div', { class: 'fc-grid' }, h('div', null, '下一站', el.next), h('div', null, '速度', el.speed), h('div', null, '线路', el.type), h('div', null, '载客', el.lf)),
      h('div', { class: 'fc-hint' }, h('span', null, (CM.Keys.hint('ui.hideUI') || '未绑定') + ' 显示界面 · Esc 暂停并打开菜单'), h('button', { class: 'btn sm fc-restore', onclick: function () { Follow.toggleUI(false); } }, '显示界面')),
      h('div', { class: 'fc-acts' },
        h('button', { class: 'btn sm ghost', 'data-tip': '同一线路的上一列车', onclick: function () { Follow.cycle(-1); } }, ic('back', 14), '上一列'),
        h('button', { class: 'btn sm ghost', 'data-tip': '同一线路的下一列车', onclick: function () { Follow.cycle(1); } }, '下一列', ic('chev', 14)),
        el.under, h('span', { class: 'grow' }), el.play,
        h('button', { class: 'btn sm', onclick: function () { Follow.toggleUI(); } }, '隐藏界面', CM.Keys.hint('ui.hideUI') ? h('kbd', null, CM.Keys.hint('ui.hideUI')) : null),
        h('button', { class: 'btn sm primary', onclick: function () { Follow.stop(); } }, '退出', h('kbd', null, 'Esc'))));
    el.under.textContent = autoUnder ? '自动地下视图：开' : '自动地下视图：关';
    localize(card);
  }
  const localize = function (node) { if (CM.I18n) CM.I18n.localize(node); };
  // 只在文字真的变化时写入（并翻译这一处），不触动其他节点
  const put = function (node, text) { if (node._t !== text) { node._t = text; node.textContent = text; localize(node); } };
  function render(o) {
    if (!card) return;
    if (!el) build();
    const g = CM.game, paused = !g || g.speed === 0, L = o.line, col = AX.line(L);
    put(el.num, CM.Metro.lineBadge(L));
    if (el.num._c !== col) { el.num._c = col; el.num.style.background = col; el.num.style.color = AX.ink(col); }
    put(el.line, o.rt.label || L.name);
    put(el.dir, o.term ? '开往 ' + o.term.name : '环线 · ' + o.loopDir);
    put(el.status, statusText(o));
    put(el.next, o.dwell ? '本站' : U.fmtNum(o.toNext / 1000, 2) + ' km');
    put(el.speed, Math.round(o.v * 3.6) + ' km/h');
    put(el.type, TYPE[o.type] || '');
    put(el.lf, o.lf > 0 ? paxNum(o) + ' 人（' + U.fmtPct(o.lf, 0) + '）' : '—');
    if (el.lf.dataset.tip !== paxText(o)) el.lf.dataset.tip = paxText(o);
    // 显隐用 display（按钮与标签的样式会覆盖 hidden 属性）
    const disp = paused ? '' : 'none';
    if (el.paused.style.display !== disp) { el.paused.style.display = disp; el.play.style.display = disp; }
    if (ui) ui.queueLayout();
  }
  function setUnder(v) { if (R.cam.tu !== v) { R.setUnder(v === 1); if (ui) ui.renderToolbar(); } }

  const Follow = {
    used: false,
    init: function (u) { ui = u; R = u.R; },
    active: function () { return !!t; },
    // 屏幕坐标处的列车（只认本帧画出的）
    pick: function (sx, sy) {
      if (!R) return null;
      let best = null, bd = 13;
      for (const tr of trains()) {
        if (tr.dying || !tr.g || tr.drawn == null || R.frame - tr.drawn > 1 || tr.alpha < 0.3) continue;
        let d = Math.hypot(tr.sx - sx, tr.sy - sy);
        const p = tr.pickPath;
        if (p) for (let i = 0; i + 3 < p.length; i += 2) d = Math.min(d, U.distToSeg(sx, sy, p[i], p[i + 1], p[i + 2], p[i + 3]));
        if (d < bd) { bd = d; best = tr; }
      }
      return best;
    },
    describe: function (tr) {
      const old = t; t = tr; const o = info(); t = old;
      return o ? { title: (o.rt.label || o.line.name) + ' 列车', lines: [(o.term ? '开往 ' + o.term.name : '环线') + ' · ' + statusText(o), paxText(o)].concat(o.model ? ['车型 ' + o.model] : [], ['点击跟随这列车']) } : null;
    },
    start: function (tr) {
      if (!tr || !ui) return;
      const was = !!t;
      t = tr; lineId = tr.g.rt.lineId; routeR = tr.g.r;
      Follow.used = true;
      if (CM.game && CM.game.tutorial) CM.game.tutorial.followed = true;
      if (!was) { under0 = R.cam.tu; autoUnder = true; }
      R.cam.fly = null; R.cam.anchor = null;
      if (!was && R.cam.tz < 30) { R.cam.tz = 32; R.cam.anchor = null; }
      R.follow = tr;
      if (!card) { card = h('div', { id: 'followCard', class: 'hud glass' }); el = null; document.getElementById('app').appendChild(card); }
      document.body.classList.add('following');
      if (!was) ui.closePanel(true);
      if (ui.tools && ui.tools.tool !== 'select') ui.tools.setTool('select');
      if (!was) snd('swoosh');
      lastInfo = 0;
      Follow.tick(0);
    },
    // quiet：换地图、返回菜单等场合，不恢复视图、不提示
    stop: function (quiet) {
      if (!t && !card) return;
      t = null; if (R) R.follow = null;
      if (card) { card.remove(); card = null; el = null; }
      document.body.classList.remove('following');
      if (!quiet && R) { if (autoUnder) setUnder(under0); snd('soft'); }
    },
    toggleUI: function (on) {
      if (ui) ui.toggleImmersive(on);
    },
    cycle: function (dir) {
      if (!t) return;
      const list = trains().filter(function (tr) { return !tr.dying && tr.g && tr.g.rt.lineId === lineId; }).sort(function (a, b) { return a.id - b.id; });
      if (list.length < 2) { ui.toast('这条线路目前只有这一列车在运行', 'info'); return; }
      const k = list.indexOf(t);
      Follow.start(list[(k + dir + list.length) % list.length]);
    },
    tick: function (dt) {
      if (!t) return;
      if (!CM.game) { Follow.stop(true); return; }
      // 列车下线（线路调整或减少班次）：换同一线路的另一列，没有则退出
      if (t.dying || !t.g) {
        const alt = trains().find(function (tr) { return !tr.dying && tr.g && tr.g.rt.lineId === lineId && tr.g.r === routeR; }) || trains().find(function (tr) { return !tr.dying && tr.g && tr.g.rt.lineId === lineId; });
        if (alt) { Follow.start(alt); return; }
        Follow.stop(); ui.toast('这列车已结束运营（夜间停运或线路调整），已退出跟随', 'info'); return;
      }
      const o = info(); if (!o) return;
      const c = R.cam, k = dt > 0 ? 1 - Math.exp(-dt * 7) : 1;
      c.fly = null; c.anchor = null;
      c.cx += (o.x - c.cx) * k; c.cy += (o.y - c.cy) * k;
      if (autoUnder) setUnder(o.type === 'underground' && o.h < -0.01 ? 1 : 0);
      const now = performance.now();
      if (now - lastInfo > 250) { lastInfo = now; render(o); }
    },
  };
  CM.Follow = Follow;
})(window.CM);
