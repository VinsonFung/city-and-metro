'use strict';
// Browser presentation and lifecycle; browser chrome, shortcuts and small-screen layout stay in ui.js.
(function (CM) {
  const UI = CM.UI, U = CM.U, CFG = CM.CFG, D = CM.DATA, h = U.h, ic = CM.icon;
  UI.ERA_COLORS = ['#2f9e8f', '#3a7bd5', '#c2410c', '#7c4dff', '#d6336c', '#0f8a5f', '#b7791f', '#5b6b8c'];
  const snd = name => { if (CM.Sound) CM.Sound.play(name); };
  UI.prototype.updateEraChip = function (g) {
    const E = CM.Eras, chip = this.eraChip;
    if (!E || !E.enabled()) { chip.classList.add('gone'); return; }
    const t = g.year(), k = E.index(t), e = E.list()[k];
    const to = E.endOf(k) || e.from + 15, frac = U.clamp((t - e.from) / Math.max(0.5, to - e.from), 0, 1);
    if (chip._k !== k) {
      chip._k = k;
      chip.classList.remove('gone');
      chip.style.setProperty('--ec', UI.ERA_COLORS[k % UI.ERA_COLORS.length]);
      chip.querySelector('.v').textContent = e.name;
      chip.querySelector('.k').textContent = e.from + (E.endOf(k) ? '–' + E.endOf(k) : ' 年起');
      chip.setAttribute('data-tip', '发展阶段：' + e.name + ' · 点击查看本阶段的城市变化');
      if (CM.I18n) CM.I18n.localize(chip);
    }
    const w = Math.round(frac * 1000) / 10;
    if (chip._w !== w) { chip._w = w; chip.querySelector('.ec-prog i').style.width = w + '%'; }
    chip.classList.toggle('on', !!this.topIs(['era']) && !this.right.classList.contains('closed'));
  };

  // 载入动画（v2.2 第三次重做）：严格以 LOGO 原图为准，循环播放、不旋转。画面就是 LOGO 图片本身，由沿笔画走向的遮罩逐段显出——
  // 外环像列车绕行一圈画出，楼群自左向右依次升起，地铁线穿过车站画出、车站随之亮起，成形后一道光扫过，再柔和地淡出，周而复始。
  // 笔画位置量自 LOGO 原图（384 × 384）。下方进度条为一段线路，沿途车站逐个点亮
  const LD_LOOP = 4200;
  let ldSerial = 0;
  const LD_RING = { cx: 192.5, cy: 212.3, r: 158, a0: -73, a1: 253 };
  // [x, 底, 顶, 宽]：六座楼
  const LD_BARS = [[80.5, 211, 150, 44], [127.5, 211, 108, 46], [171.5, 211, 18, 38], [214, 238, 0, 38], [257.5, 245, 80, 45], [305, 245, 140, 45]];
  // 地铁线（遮罩中心线，宽约为线宽加车站外圈）与车站 [x, y, 半径]
  const LD_LINES = [{ d: 'M30 224 L183 224 L193 236 L212 256 L356 256', w: 32 }, { d: 'M84 287 L158 288 Q182 295 188 322', w: 32 }, { d: 'M192 238 L192 330', w: 28 }];
  const LD_STATIONS = [[38, 224.5, 25], [92, 287, 25], [192, 149, 21], [345, 256, 25], [192.5, 343.5, 27]];
  // 各笔画在一个循环中的开始时刻与时长（0–1）
  const LD_T = { ring: [0.02, 0.24], bars: [0.18, 0.05, 0.16], lines: [[0.36, 0.2], [0.46, 0.14], [0.44, 0.1]], st: [0.38, 0.5, 0.33, 0.54, 0.56], shine: [0.62, 0.16], fade: [0.82, 0.12] };
  // 进度条以下与原先相同；进度由开局、读档与推演过程报告（CM.loadProgress），两次报告之间缓慢前移，不会停住不动
  // mapId（v2.2）：载入的城市——以该城市的地图画面为全屏背景（从选择地图放大过来时沿用放大的画面）
  UI.prototype.showLoading = function (text, kind, mapId) {
    const self = this;
    const stops = kind === 'load' ? [[0.3, '城市'], [0.42, '交通'], [0.95, '出行']] : kind === 'pre' ? [[0.2, '城市'], [0.83, '推演'], [0.96, '出行']] : [[0.2, '城市'], [0.3, '交通'], [0.92, '出行']];
    this._loadNote = h('div', { class: 'ld-note' }, text);
    const fill = h('i', { class: 'ld-fill' }), head = h('span', { class: 'ld-head' }), pct = h('b', { class: 'ld-pct' }, '0%'), stage = h('span', { class: 'ld-stage' }, '准备');
    const track = h('div', { class: 'ld-track' }, h('i', { class: 'ld-rail' }), fill,
      stops.map(function (s) { return h('span', { class: 'ld-stop', style: { left: (s[0] * 100) + '%' } }, h('i'), h('em', null, s[1])); }), head);
    // LOGO 图片 + 沿笔画的遮罩（描边按 pathLength=1 的虚线偏移逐段显出）；光带只落在 LOGO 的不透明像素上
    const NS = 'http://www.w3.org/2000/svg', uid = 'ld' + (++ldSerial), dark = document.documentElement.dataset.theme === 'dark', src = dark ? 'img/logo-white.png' : 'img/logo-navy.png';
    const el = function (tag, attrs, parent) { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); if (parent) parent.appendChild(e); return e; };
    const svg = el('svg', { viewBox: '0 0 384 384', 'aria-hidden': 'true' }), defs = el('defs', {}, svg);
    const mask = el('mask', { id: uid + 'm', maskUnits: 'userSpaceOnUse', x: 0, y: 0, width: 384, height: 384 }, defs);
    const stroke = function (d, w) { return el('path', { d: d, fill: 'none', stroke: '#fff', 'stroke-width': w, 'stroke-linecap': 'butt', 'stroke-linejoin': 'round', pathLength: 1, 'stroke-dasharray': '1 2', 'stroke-dashoffset': 1 }, mask); };
    const RG = LD_RING, pt = function (a) { a *= Math.PI / 180; return (RG.cx + Math.cos(a) * RG.r).toFixed(1) + ' ' + (RG.cy + Math.sin(a) * RG.r).toFixed(1); };
    const ring = stroke('M' + pt(RG.a0) + ' A' + RG.r + ' ' + RG.r + ' 0 1 1 ' + pt(RG.a1), 29);
    const bars = LD_BARS.map(function (b) { return stroke('M' + b[0] + ' ' + b[1] + ' L' + b[0] + ' ' + b[2], b[3]); });
    const lines = LD_LINES.map(function (l) { return stroke(l.d, l.w); });
    const stations = LD_STATIONS.map(function (s) { return el('circle', { cx: s[0], cy: s[1], r: 0, fill: '#fff' }, mask); });
    const alpha = el('mask', { id: uid + 'a', style: 'mask-type:alpha', maskUnits: 'userSpaceOnUse', x: 0, y: 0, width: 384, height: 384 }, defs);
    el('image', { href: src, x: 0, y: 0, width: 384, height: 384 }, alpha);
    const grad = el('linearGradient', { id: uid + 'g', x1: 0, x2: 1, y1: 0, y2: 0 }, defs);
    for (const s of [[0, 0], [0.5, dark ? 0.35 : 0.55], [1, 0]]) el('stop', { offset: s[0], 'stop-color': '#fff', 'stop-opacity': s[1] }, grad);
    const mark = el('g', {}, svg);
    el('image', { href: src, x: 0, y: 0, width: 384, height: 384, mask: 'url(#' + uid + 'm)' }, mark);
    const shineG = el('g', { mask: 'url(#' + uid + 'a)' }, mark), shine = el('rect', { x: -260, y: -40, width: 150, height: 464, fill: 'url(#' + uid + 'g)', transform: 'skewX(-16)' }, shineG);
    const logo = h('div', { class: 'ld-logo' }); logo.appendChild(svg);
    const bgOn = !!(this._stageBg && this._stageBg.classList.contains('on')), mp = mapId && CM.MAPS[mapId];
    const again = /ld-screen/.test(this.screen.className) && this.screen.className.indexOf('hidden') < 0;   // 读档的第二段载入：原地更新，不再播放入场
    this.openScreen(h('div', { class: 'card ld-card' }, logo, this._loadNote, track, h('div', { class: 'ld-row' }, stage, pct)), null, mp ? 'ld-screen' + (again ? ' noanim' : '') : '', mp && !again ? (bgOn ? 'zoom' : 'fade') : null);
    if (mp && !bgOn) this.stageBg(CM.mapThumb(mapId, dark ? 'dark' : 'light'));
    const L = this._ld = { goal: 0.02, disp: 0, cap: 0.08, done: false, t: performance.now(), t0: performance.now(), fill: fill, head: head, pct: pct, stage: stage, stops: track.querySelectorAll('.ld-stop'), at: stops };
    const still = CM.Settings.reducedMotion(), T = LD_T;
    const ease = function (x) { x = U.clamp(x, 0, 1); return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; };   // 三次缓入缓出
    const draw = function (e, u) { e.setAttribute('stroke-dashoffset', (1 - u).toFixed(4)); };
    const anim = function (now) {
      const t = still ? 0.7 : ((now - L.t0) % LD_LOOP) / LD_LOOP, at = function (s, d) { return still ? 1 : ease((t - s) / d); };
      draw(ring, at(T.ring[0], T.ring[1]));
      bars.forEach(function (b, i) { draw(b, at(T.bars[0] + i * T.bars[1], T.bars[2])); });
      lines.forEach(function (l, i) { draw(l, at(T.lines[i][0], T.lines[i][1])); });
      stations.forEach(function (c, i) { c.setAttribute('r', (LD_STATIONS[i][2] * at(T.st[i], 0.08)).toFixed(2)); });
      const s = still ? 0 : U.clamp((t - T.shine[0]) / T.shine[1], 0, 1);
      shine.setAttribute('x', (-260 + s * 700).toFixed(1)); shine.style.opacity = s > 0 && s < 1 ? 1 : 0;
      mark.style.opacity = still ? 1 : (1 - ease((t - T.fade[0]) / T.fade[1])).toFixed(4);
    };
    anim(performance.now());
    const tick = function (now) {
      if (self._ld !== L || !fill.isConnected) return;
      const dt = Math.min(0.1, (now - L.t) / 1000); L.t = now;
      // 先较快追上报告的进度，之后向下一个上限缓慢前移；完成时补满
      if (L.disp < L.goal) L.disp += (L.goal - L.disp) * (1 - Math.exp(-dt * (L.done ? 9 : 5))) + dt * 0.01;
      else L.disp += (L.cap - L.disp) * (1 - Math.exp(-dt * 0.3));
      L.disp = Math.min(L.disp, L.done ? 1 : 0.99);
      const p = L.disp;
      fill.style.transform = 'scaleX(' + p.toFixed(4) + ')'; head.style.left = (p * 100).toFixed(2) + '%';
      pct.textContent = Math.floor(p * 100 + (L.done && p > 0.995 ? 0.5 : 0)) + '%';
      for (let i = 0; i < L.stops.length; i++) L.stops[i].classList.toggle('on', p >= L.at[i][0] - 0.002);
      anim(now);
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  };
  UI.prototype.loadProgress = function (p, label) {
    const L = this._ld; if (!L || !L.fill.isConnected) return;
    L.goal = Math.max(L.goal, U.clamp(p, 0, 1)); L.cap = Math.min(0.99, L.goal + 0.08);
    if (label && L.stage.textContent !== label) { L.stage.textContent = label; if (CM.I18n) CM.I18n.localize(L.stage); }
    if (p >= 1) L.done = true;
  };

  UI.prototype.finishLoading = function (cb) {
    const L = this._ld;
    if (!L || !L.fill.isConnected || CM.Settings.reducedMotion()) { cb(); return; }
    this.loadProgress(1, '准备就绪');
    const self = this;
    setTimeout(function () { if (self._ld === L) { L.pct.textContent = '100%'; L.fill.style.transform = 'scaleX(1)'; L.head.style.left = '100%'; setTimeout(function () { if (self._ld === L) { self._ld = null; cb(); } }, 32); } }, 360);   // 期间又开始了新的载入时放弃这一次
  };


  UI.prototype.showJump = function () {
    const g = this.g(), j = g.jumping, self = this, from = j.from, to = j.target;
    const n = Math.max(1, (to[0] - from[0]) * 12 + (to[1] - from[1]));
    const yv = h('span', { class: 'jp-y' }, ''), mv = h('span', { class: 'jp-m' }, '');
    const fill = h('i', { class: 'jp-fill' }), train = h('span', { class: 'jp-train' }, h('i'));
    const stops = [];
    for (let k = 1; k <= n; k++) {
      const ym = from[0] * 12 + (from[1] - 1) + k, y = Math.floor(ym / 12), m = ym % 12 + 1;
      stops.push(h('span', { class: 'jp-stop', style: { left: (k / n * 100) + '%' } }, h('i'), h('em', null, m === 1 || n <= 3 ? y + '.' + m : String(m))));
    }
    const pct = h('b', { class: 'jp-pct' }, '0%'), ev = h('div', { class: 'jp-ev' }), pop = h('b', null, '—'), share = h('b', null, '—');
    this.openScreen(h('div', { class: 'card jp-card' },
      h('div', { class: 'jp-kick' }, ic('calYear', 15), h('span', null, '时间推进 · ' + (n === 12 ? '1 年' : n + ' 个月'))),
      h('div', { class: 'jp-date' }, yv, mv),
      h('div', { class: 'jp-line' }, h('span', { class: 'jp-origin' }), h('i', { class: 'jp-rail' }), fill, stops, train),
      h('div', { class: 'jp-stats' }, h('span', null, '人口 ', pop), h('span', null, '地铁分担率 ', share), pct),
      ev,
      h('div', { class: 'jp-foot' }, '逐日结算票款与运营费用，按月处理拨款、城市发展、区域开放与任务')), null);
    const J = this._jp = { p: 0, disp: 0, t: performance.now(), ym: -1, evN: g.events.length };
    const tick = function (now) {
      if (self._jp !== J || !fill.isConnected) return;
      const dt = Math.min(0.1, (now - J.t) / 1000); J.t = now;
      J.disp += (J.p - J.disp) * (1 - Math.exp(-dt * 7));
      const p = J.disp;
      fill.style.transform = 'scaleX(' + p.toFixed(4) + ')'; train.style.left = (p * 100).toFixed(2) + '%';
      pct.textContent = Math.floor(p * 100) + '%';
      for (let i = 0; i < n; i++) stops[i].classList.toggle('on', p >= (i + 1) / n - 0.004);
      const c = g.clock, ym = c.y * 12 + c.m;
      if (ym !== J.ym) {
        const first = J.ym < 0; J.ym = ym;
        const en = CM.I18n && CM.I18n.get() === 'en';
        yv.textContent = en ? String(c.y) : c.y + ' 年'; mv.textContent = en ? ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][c.m - 1] : c.m + ' 月';
        if (!first) { mv.classList.remove('flip'); void mv.offsetWidth; mv.classList.add('flip'); }
        pop.textContent = U.fmtPeople(g.city.totals().pop); share.textContent = U.fmtPct((g.model.daily && g.model.daily.metroShare) || 0);
        if (g.events.length > J.evN) {
          const e = g.events[g.events.length - 1]; J.evN = g.events.length;
          ev.textContent = e.y + '.' + e.m + ' · ' + e.title; if (CM.I18n) CM.I18n.localize(ev);
          ev.classList.remove('flash'); void ev.offsetWidth; ev.classList.add('flash');
        }
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  };

  UI.prototype.updateJump = function (p) { if (this._jp) this._jp.p = U.clamp(p, 0, 1); };



  UI.LAYERS.push({ id: 'dev', group: 'city', name: '城市发展', icon: 'chart', color: '#0f8a5f', desc: '本阶段以来人口、岗位与新开发用地的变化' });
  const chrome = UI.prototype.buildChrome;
  UI.prototype.buildChrome = function () {
    chrome.apply(this, arguments);
    const self = this;
    this.eraChip = h('button', { class: 'pill erachip gone', 'data-tip': '发展阶段', onclick: () => self.openTop('era') },
      h('span', { class: 'ec-dot' }), h('span', { class: 'tx' }, h('span', { class: 'k' }, '发展阶段'), h('span', { class: 'v' }, '')), h('span', { class: 'ec-prog' }, h('i')));
    this.pills.date.el.insertAdjacentElement('afterend', this.eraChip);
    this.histHost = h('div', { id: 'histHost' }); this.feed.appendChild(this.histHost); this.clearHist();
    // 阶段背景先整段翻译再分行；切语言时重新构造，避免逐行翻译遗留混排。
    if (CM.I18n) CM.I18n.on(() => { if (this.topIs(['era'])) this.rerenderPage(); });
  };
  const attach = UI.prototype.attachGame;
  UI.prototype.attachGame = function (g) {
    this.clearHist(); attach.call(this, g); this.eraChip._k = null;
    g.on('era', er => { this._phaseQ.push(er); this.flushHist(); });
    g.on('histEvent', ev => { this._histQ.push(ev); this.flushHist(); });
    this.updateEraChip(g);
  };
  const clear = UI.prototype.clearCelebrations;
  UI.prototype.clearCelebrations = function () { clear.call(this); this.clearHist(); };
  const tick = UI.prototype.tick;
  UI.prototype.tick = function () { tick.apply(this, arguments); if (this.g()) { this.updateEraChip(this.g()); this.flushHist(); } };
  const openTop = UI.prototype.openTop;
  UI.prototype.openTop = function (key) {
    if (key !== 'era') return openTop.apply(this, arguments);
    if (this.topIs(['era']) && !this.right.classList.contains('closed')) this.closePanel(true);
    else this.openPage('era', null, { root: true });
  };
  const datePage = UI.prototype.page_date;
  UI.prototype.page_date = function () {
    const page = datePage.call(this), self = this, e = CM.Eras.current(this.g().year());
    page.el.prepend(h('button', { class: 'btn', onclick: () => self.openPage('era', null, { root: true }) }, '发展阶段 · ' + (e ? e.name : '')));
    return page;
  };
  UI.settingsExtra.display.push(function () {
    const S=CM.Settings, b=h('button',{class:'switch'+(S.get('lighting')?' on':''),role:'switch','aria-label':'统一光照','aria-checked':String(S.get('lighting')!==false),onclick:function(){const on=S.get('lighting')===false;S.set('lighting',on);b.classList.toggle('on',on);b.setAttribute('aria-checked',String(on));}},h('i'));
    return h('div',{class:'set-row'},h('span',{class:'set-ico'},ic('sun')),h('div',{class:'grow'},h('div',{class:'set-t'},'统一光照'),h('div',{class:'set-d'},'山体与建筑使用同一光向，白天与夜晚随主题切换')),b);
  });
  UI.settingsExtra.display.push(function () {
    const S=CM.Settings, b=h('button',{class:'switch'+(S.get('stationModels')?' on':''),role:'switch','aria-label':'车站模型','aria-checked':String(S.get('stationModels')!==false),onclick:function(){const on=S.get('stationModels')===false;S.set('stationModels',on);b.classList.toggle('on',on);b.setAttribute('aria-checked',String(on));}},h('i'));
    return h('div',{class:'set-row'},h('span',{class:'set-ico'},ic('station')),h('div',{class:'grow'},h('div',{class:'set-t'},'车站模型'),h('div',{class:'set-d'},'在 2.5D 近景显示站台、出入口与车站装修')),b);
  });
})(window.CM);
