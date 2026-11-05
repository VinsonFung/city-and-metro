'use strict';
// 全屏界面：开始界面、选择地图（左侧预览与选择、右侧详情，搜索与筛选）、开局简报、更新公告
(function (CM) {
  const U = CM.U, CFG = CM.CFG, UI = CM.UI;
  const h = U.h, ic = CM.icon;
  const snd = function (name) { if (CM.Sound) CM.Sound.play(name); };
  const LEVEL = ['入门', '普通', '进阶', '挑战'];
  const REGION_ORDER = ['中国内地', '中国香港', '中国台湾', '日本', '法国', '虚构'];

  // 公告是否已读（本机记录；无法访问本地存储时视为已读，不打扰）
  const NEWS_KEY = 'cm1.newsSeen';
  const newsSeen = function () { try { return localStorage.getItem(NEWS_KEY) === CFG.GAME_VERSION; } catch (e) { return true; } };
  const markNews = function () { try { localStorage.setItem(NEWS_KEY, CFG.GAME_VERSION); } catch (e) { /* ignore */ } };
  UI.prototype.newsUnread = function () { return !newsSeen(); };

  // 难度：点 + 文字
  const levelEl = function (n) {
    const d = h('span', { class: 'lvl', 'data-tip': '难度：' + LEVEL[n - 1] });
    for (let k = 1; k <= 4; k++) d.appendChild(h('i', { class: k <= n ? 'on' : '' }));
    d.appendChild(h('b', null, LEVEL[n - 1]));
    return d;
  };
  const eraOf = function (mp) { return Math.floor(mp.cfg.START.y / 10) * 10; };
  const eraName = function (e) { return e + ' 年代'; };
  // 鼠标/笔横拖筛选，触屏保留原生惯性滚动；捕获原按钮以保留普通点击。
  function scrollFilters(chips) {
    let drag = null, suppressClick = false;
    const edges = function () {
      const max = Math.max(0, chips.scrollWidth - chips.clientWidth);
      chips.classList.toggle('can-drag', max > 1);
      chips.classList.toggle('has-before', chips.scrollLeft > 1);
      chips.classList.toggle('has-after', chips.scrollLeft < max - 1);
    };
    const finish = function (e) {
      if (!drag || drag.id !== e.pointerId) return;
      const owner = drag.owner; drag = null;
      chips.classList.remove('dragging');
      if (e.type === 'pointercancel') suppressClick = false;
      if (owner.hasPointerCapture(e.pointerId)) owner.releasePointerCapture(e.pointerId);
    };
    chips.addEventListener('pointerdown', function (e) {
      if (!e.isPrimary || e.button !== 0) return;
      suppressClick = false;
      if (e.pointerType === 'touch' || chips.scrollWidth <= chips.clientWidth + 1) return;
      const owner = e.target.closest('.fchip') || chips;
      drag = { id: e.pointerId, x: e.clientX, y: e.clientY, left: chips.scrollLeft,
        scale: chips.getBoundingClientRect().width / (chips.offsetWidth || 1), owner: owner, moved: false };
      owner.setPointerCapture(e.pointerId);
    });
    chips.addEventListener('pointermove', function (e) {
      if (!drag || drag.id !== e.pointerId) return;
      if (!(e.buttons & 1)) { finish(e); return; }
      const dx = e.clientX - drag.x;
      if (!drag.moved) {
        if (Math.abs(dx) < 6 || Math.abs(dx) < Math.abs(e.clientY - drag.y)) return;
        drag.moved = true; suppressClick = true; chips.classList.add('dragging');
      }
      e.preventDefault();
      chips.scrollLeft = drag.left - dx / (drag.scale || 1);
      edges();
    });
    for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) chips.addEventListener(name, finish);
    chips.addEventListener('click', function (e) {
      const block = suppressClick && e.detail !== 0; suppressClick = false;
      if (block) { e.preventDefault(); e.stopImmediatePropagation(); }
    }, true);
    chips.addEventListener('dragstart', function (e) { e.preventDefault(); });
    chips.addEventListener('scroll', edges, { passive: true });
    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver(function () {
        if (!chips.isConnected) { observer.disconnect(); return; }
        edges();
      });
      observer.observe(chips);
      for (const button of chips.children) observer.observe(button);
    }
    requestAnimationFrame(edges);
  }


  // ======================== 开始界面 ========================
  // 标题装饰：线路、车站与城市剪影
  const TITLE_DECO = '<svg class="title-deco" viewBox="0 0 400 34" preserveAspectRatio="xMinYMid meet" aria-hidden="true"><path d="M150 22 H222 M290 22 H392" stroke="currentColor" stroke-width="2" stroke-linecap="round" opacity=".55"/>' +
    '<circle cx="168" cy="22" r="4.5" style="fill:var(--bg)" stroke="currentColor" stroke-width="2.4"/><circle cx="208" cy="22" r="4.5" style="fill:var(--bg)" stroke="currentColor" stroke-width="2.4"/>' +
    '<g fill="currentColor"><rect x="228" y="12" width="7" height="12" rx="1"/><rect x="237" y="6" width="8" height="18" rx="1"/><rect x="247" y="0" width="8" height="24" rx="1"/><rect x="257" y="8" width="7" height="16" rx="1"/><rect x="266" y="3" width="8" height="21" rx="1"/><rect x="276" y="13" width="7" height="11" rx="1"/></g>' +
    '<circle cx="308" cy="22" r="4.5" style="fill:var(--bg)" stroke="currentColor" stroke-width="2.4"/><circle cx="348" cy="22" r="4.5" style="fill:var(--bg)" stroke="currentColor" stroke-width="2.4"/></svg>';

  // calm：从游戏回到主菜单时整体淡入（v2.3），标题与按钮不逐个重新弹出
  UI.prototype.showStart = function (tr, calm) {
    const self = this;
    const latest = CM.Save.latest();
    const storageOk = CM.Save.available();
    const btn = function (icon, label, onclick, opts) {
      opts = opts || {};
      return h('button', { class: 'start-btn' + (opts.primary ? ' primary' : ''), disabled: opts.disabled ? true : null, onclick: onclick },
        ic(icon), h('span', { class: 'lb' }, label), opts.sub ? h('span', { class: 'sub' }, opts.sub) : null, ic('chev', 18, 'chev'));
    };
    const title = CM.I18n && CM.I18n.get() === 'en' ? h('h1', { class: 'start-title' }, '城市与地铁') : h('h1', { class: 'start-title' }, '城市', h('span', { class: 'yu' }, '与'), '地铁');
    const wrap = h('div', { class: 'start-wrap' },
      title, h('div', { html: TITLE_DECO }),
      h('div', { class: 'start-menu' },
        btn('play', '开始游戏', function () { self.showMapSelect(null, 'fwd'); }, { primary: true, sub: '选择地图' }),
        btn('clock', '继续游戏', function () { if (latest) self.loadSlot(latest.slotId); }, { disabled: !latest, sub: latest ? ((CM.MAPS[latest.map || 'gz'] || {}).name || '') + ' · ' + latest.date[0] + '年' + latest.date[1] + '月' : '暂无存档' }),
        btn('gear', '设置', function () { self.showSettings(); }),
        btn('power', '退出', function () { self.quitGame(); })),
      CM.MAPS.tutorial ? h('button', { class: 'start-learn', onclick: function () { self.showMapSelect('tutorial'); } }, ic('help', 16), h('span', null, '第一次玩？先试试'), h('b', null, '新手教程 · 青湾'), ic('chev', 14)) : null,
      !storageOk ? h('div', { class: 'callout bad', style: { marginTop: '14px' } }, ic('error'), h('div', { class: 'ct' }, '当前浏览器禁止本地存储，进度将无法自动保存。')) : null,
      h('div', { class: 'start-foot' }, '规划地铁、改变出行、塑造城市。', h('br'),
        h('a', { href: 'LICENSE.txt', target: '_blank', rel: 'noopener' }, '© 2026 VinsonFung · 仅限非商业使用'), h('br'),
        h('a', { href: 'https://www.openstreetmap.org/copyright', target: '_blank', rel: 'noopener' }, '地图 © OpenStreetMap 贡献者 · ODbL'), ' · v' + CFG.GAME_VERSION));
    // 右上角：公告、官方社区和主题共用按钮样式；外链保留当前游戏页面。
    const news = h('button', { class: 'corner-btn' + (newsSeen() ? '' : ' dot'), 'data-tip': '更新公告', 'aria-label': '更新公告', onclick: function () { self.showNews(function () { self.showStart(); }); } }, ic('megaphone'));
    const social = function (icon, label, href) {
      return h('a', { class: 'corner-btn', href: href, target: '_blank', rel: 'noopener noreferrer', 'data-tip': label, 'aria-label': label }, ic(icon, null, icon === 'xiaohongshu' ? 'brand-wordmark' : ''));
    };
    this.startTheme = h('button', { class: 'corner-btn', 'aria-label': '切换深浅模式', onclick: function () { self.toggleTheme(); } });
    const corner = h('div', { class: 'start-corner' }, news,
      social('bilibili', '游戏官方 B站', 'https://b23.tv/H18TUXD'),
      social('xiaohongshu', '游戏官方小红书', 'https://xhslink.cn/o/5eRdolGBwyK'),
      social('douyin', '游戏官方抖音', 'https://v.douyin.com/XdxVSS5NHK8/'), this.startTheme);
    this.openScreen(h('div', { class: 'start-root' }, wrap, corner), null, 'start' + (calm ? ' calm' : ''), tr || null);
    this.renderThemeBtns();
  };

  // ======================== 选择地图 ========================
  UI.prototype.showMapSelect = function (selId, tr) {
    const self = this, all = CM.MAP_ORDER.slice();
    let sel = selId && CM.MAPS[selId] ? selId : (this._mapSel && CM.MAPS[this._mapSel] ? this._mapSel : all[0]);
    const F = this._mapFilter || (this._mapFilter = { q: '', era: 'all', region: 'all' }), freeOpts = this._freeOpts || (this._freeOpts = {});
    if (selId) { F.q = ''; F.era = 'all'; F.region = 'all'; }
    const theme = document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
    const eras = Array.from(new Set(all.map(function (id) { return eraOf(CM.MAPS[id]); }))).sort();
    const regions = REGION_ORDER.filter(function (r) { return all.some(function (id) { return CM.MAPS[id].region === r; }); });
    const back = function () { self.showStart('back'); };

    // ---- 左栏：搜索、筛选、地图列表 ----
    const search = h('input', { type: 'search', class: 'msel-q', placeholder: '搜索城市、年代或特色', 'aria-label': '搜索地图', value: F.q, autocomplete: 'off' });
    const clear = h('button', { class: 'iconbtn sm', 'data-tip': '清除', 'aria-label': '清除搜索', onclick: function () { search.value = ''; F.q = ''; clear.classList.add('gone'); drawList(); search.focus(); } }, ic('close', 15));
    if (!F.q) clear.classList.add('gone');
    search.addEventListener('input', function () { F.q = search.value.trim(); clear.classList.toggle('gone', !F.q); drawList(); });
    const chipRow = function (label, icon, key, opts) {
      const chips = h('div', { class: 'fchips', role: 'group', 'aria-label': label + '筛选，可左右拖动查看更多选项' });
      for (const o of opts) {
        chips.appendChild(h('button', { class: 'fchip' + (F[key] === o[0] ? ' on' : ''), 'data-silent': '1', 'data-v': o[0], onclick: function () {
          if (F[key] === o[0]) return;
          F[key] = o[0]; snd('soft');
          chips.querySelectorAll('.fchip').forEach(function (x) { x.classList.toggle('on', x.dataset.v === F[key]); });
          drawList();
        } }, o[1]));
      }
      scrollFilters(chips);
      return h('div', { class: 'ms2-frow' }, h('span', { class: 'ms2-fl' }, ic(icon, 14), label), chips);
    };
    const filters = h('div', { class: 'ms2-filters' },
      chipRow('地区', 'globe', 'region', [['all', '全部']].concat(regions.map(function (r) { return [r, r]; }))),
      chipRow('年代', 'calYear', 'era', [['all', '全部']].concat(eras.map(function (e) { return [String(e), eraName(e)]; }))));
    const list = h('div', { class: 'ms2-list', role: 'listbox', 'aria-label': '地图' });
    const empty = h('div', { class: 'msel-empty hidden-el' }, ic('search', 22), h('b', null, '没有符合条件的地图'), h('span', null, '换个关键词，或把筛选改回「全部」。'),
      h('button', { class: 'btn sm', onclick: function () { F.q = ''; F.era = 'all'; F.region = 'all'; self.showMapSelect(sel); } }, '清除筛选'));
    const count = h('span', { class: 'ms2-count' });
    const items = {};
    const text = function (mp) { const s = [mp.title, mp.name, mp.sub, mp.tagline, mp.region, eraName(eraOf(mp)), String(mp.cfg.START.y), (mp.tags || []).join(' '), mp.data.city].join(' '); return CM.I18n ? CM.I18n.search(s) : s.toLowerCase(); };
    const match = function (id) {
      const mp = CM.MAPS[id];
      if (F.era !== 'all' && String(eraOf(mp)) !== F.era) return false;
      if (F.region !== 'all' && mp.region !== F.region) return false;
      if (F.q) { const t = text(mp); for (const w of F.q.toLowerCase().split(/\s+/)) if (w && t.indexOf(w) < 0) return false; }
      return true;
    };
    all.forEach(function (id, k) {
      const mp = CM.MAPS[id], n = CM.Save.list(id).length;
      const it = h('button', { class: 'ms2-item', role: 'option', 'data-id': id, style: { animationDelay: (0.03 * Math.min(k, 8)) + 's' }, onclick: function () { pick(id); }, ondblclick: function () { pick(id); goPrimary(); } },
        h('span', { class: 'ms2-thumb' }, CM.thumbInto(h('img', { alt: '' }), id, theme), mp.tutorial ? h('span', { class: 'ms2-flag' }, '教程') : null),
        h('span', { class: 'ms2-it' },
          h('span', { class: 'ms2-name' }, h('b', null, mp.tutorial ? (mp.data.city || mp.name) : mp.name), h('em', null, String(mp.cfg.START.y))),
          h('small', null, mp.tagline || mp.sub),
          h('span', { class: 'ms2-meta' }, levelEl(mp.difficulty || 2), h('span', { class: 'ms2-reg' }, mp.region || ''), n ? h('span', { class: 'ms2-prog', 'data-tip': n + ' 个进度' }, ic('save', 12), String(n)) : null)));
      items[id] = it; list.appendChild(it);
    });
    list.appendChild(empty);
    const drawList = function () {
      let shown = 0;
      for (const id of all) { const ok = match(id); items[id].classList.toggle('hidden-el', !ok); if (ok) shown++; }
      empty.classList.toggle('hidden-el', shown > 0);
      count.textContent = shown === all.length ? '共 ' + all.length + ' 张' : shown + ' / ' + all.length + ' 张';
      // 当前选中的地图被筛掉时，选中第一张可见的地图
      if (shown && items[sel].classList.contains('hidden-el')) { const first = all.find(function (id) { return !items[id].classList.contains('hidden-el'); }); if (first) pick(first, true); }
    };

    // ---- 右侧舞台 ----
    const stage = h('section', { class: 'ms2-stage' });
    const fmtDate = function (sl) { return sl.date[0] + '年' + sl.date[1] + '月'; };
    const goPrimary = function () { const p = stage.querySelector('.map-mode.primary'); if (p) p.click(); };
    const buildStage = function () {
      const mp = CM.MAPS[sel], games = CM.Save.list(sel), latest = CM.Save.latest(sel), y0 = mp.cfg.START.y;
      // 自由建造选项（v2.2）：起始年份（默认开局年份至史料截止年份，逐年可选）与解锁全图；按地图记住本次选择
      const fo = freeOpts[sel] || (freeOpts[sel] = { year: y0, unlock: false });
      let poster = null;
      const start = function (mode) {
        snd('build');
        const free = mode === 'free', yr = free ? fo.year : y0, r = poster && poster.getBoundingClientRect();
        self.stageBg(CM.mapThumb(sel, theme), r && r.width > 40 ? r : null);   // 地图画面放大成载入背景
        if (mp.tutorial) CM.newGame({ map: sel, mode: 'free', tutorial: true, name: '新手教程 · ' + mp.data.city });
        else CM.newGame({ map: sel, mode: mode, name: (free ? '自由建造' : '经营挑战') + ' · ' + mp.data.city + ' ' + yr, startYear: free && yr > y0 ? yr : null, unlockAll: free && fo.unlock });
      };
      // 自由建造：点击按钮展开一行选项（起始年份滑块、解锁全图、开始），按钮说明显示当前选择
      const freeParts = function () {
        const hEnd = (mp.cfg.growth && mp.cfg.growth.histEnd) || 2020;
        fo.year = U.clamp(fo.year, y0, hEnd);
        const desc = h('small'), yv = h('b', { class: 'fo-year' });
        const show = function () {
          yv.textContent = String(fo.year);
          desc.textContent = '资金不限 · ' + fo.year + ' 年起' + (fo.unlock ? ' · 全图解锁' : '');
          if (CM.I18n) CM.I18n.localize(desc);
        };
        const slider = h('input', { type: 'range', min: y0, max: hEnd, step: 1, value: fo.year, 'aria-label': '起始年份', oninput: function () { fo.year = +slider.value; show(); } });
        const sw = h('button', { class: 'switch' + (fo.unlock ? ' on' : ''), role: 'switch', 'aria-checked': fo.unlock ? 'true' : 'false', 'aria-label': '解锁全图', 'data-silent': '1', onclick: function () { fo.unlock = !fo.unlock; sw.classList.toggle('on', fo.unlock); sw.setAttribute('aria-checked', fo.unlock ? 'true' : 'false'); snd('toggle'); show(); } }, h('i'));
        const pop = h('div', { class: 'map-free' + (fo.open ? ' open' : '') },
          h('label', { class: 'fo-item fo-yr', 'data-tip': '晚于默认年份开局时，之前的城市发展按历史推演' }, h('span', { class: 'fo-k' }, '起始年份'), slider, yv),
          h('label', { class: 'fo-item', 'data-tip': '尚未开放的区域也可以建设地铁' }, h('span', { class: 'fo-k' }, '解锁全图'), sw),
          h('button', { class: 'btn primary fo-go', onclick: function () { start('free'); } }, ic('play', 14), '开始'));
        const btn = h('button', { class: 'map-mode free-toggle' + (fo.open ? ' open' : ''), 'aria-expanded': fo.open ? 'true' : 'false', 'data-silent': '1',
          onclick: function () { fo.open = !fo.open; btn.classList.toggle('open', fo.open); pop.classList.toggle('open', fo.open); btn.setAttribute('aria-expanded', fo.open ? 'true' : 'false'); snd(fo.open ? 'open' : 'close'); } },
          h('span', { class: 'badge b-teal' }, ic('sparkle')), h('span', { class: 'grow' }, h('b', null, '自由建造'), desc), ic('chev', 16));
        show();
        return [btn, pop];
      };
      const modeBtn = function (mode, icon, badge, title, desc, primary) {
        return h('button', { class: 'map-mode' + (primary ? ' primary' : ''), onclick: function () { start(mode); } },
          h('span', { class: 'badge ' + badge }, ic(icon)), h('span', { class: 'grow' }, h('b', null, title), h('small', null, desc)), ic('chev', 16));
      };
      // 地图画面：标题、标语、难度与标签；底部一行要点（范围、起始、人口、货币；真实城市另列开局 GDP，估算）
      const fl = (mp.facts || []).filter(function (f) { return f[0] !== '模式'; }).slice();
      const mc = mp.cfg.macro && mp.cfg.macro !== 'auto' ? mp.cfg.macro : null;
      if (mc && mc.gdp0) { const mo = mp.cfg.money, v = mc.gdp0; fl.push(['开局 GDP', '约 ' + (v >= 1e8 ? (v / 1e8).toFixed(2) + ' 万' + mo.yi : U.fmtMoney(v, 0, mo))]); }
      poster = h('div', { class: 'ms2-poster' },
        CM.thumbInto(h('img', { alt: '' }), sel, theme),
        h('div', { class: 'ms2-ptx' },
          h('div', { class: 'msel-kicker' }, h('span', null, mp.region || ''), h('i'), h('span', null, y0 + ' 年起'), h('i'), h('span', null, mp.kind === 'fictional' || mp.tutorial ? '虚构城市' : '真实地理')),
          h('h2', null, mp.title || mp.name),
          h('div', { class: 'ms2-tagline' }, mp.tagline || mp.sub),
          h('div', { class: 'msel-chips' }, levelEl(mp.difficulty || 2), (mp.tags || []).map(function (t) { return h('span', { class: 'tag glass-tag' }, t); }))),
        h('div', { class: 'ms2-facts' }, fl.map(function (f) { return h('div', null, h('span', null, f[0]), h('b', { title: f[1] }, f[1])); })));
      const feats = h('div', { class: 'ms2-feats' }, (mp.features || []).map(function (f, k) {
        return h('div', { class: 'ms2-feat', style: { animationDelay: (0.04 * k) + 's' } }, h('span', { class: 'badge ' + ['b-blue', 'b-teal', 'b-orange', 'b-violet'][k % 4] }, ic(f[0], 15)), h('div', null, h('b', null, f[1]), h('small', null, f[2])));
      }));
      // 大事年表：开局 + 关键历史节点，按历史阶段（与游戏内阶段同色）分组；没有大事的阶段补一个「阶段开始」节点
      const eraList = (mp.data && mp.data.eras) || [], eraAt = function (y) { let k = -1; for (let i = 0; i < eraList.length; i++) if (y >= eraList[i].from) k = i; return k; };
      const hl = [[y0, '开局']].concat(mp.highlights || []);
      eraList.forEach(function (er, i) { if (er.from > y0 && !hl.some(function (e) { return eraAt(+e[0]) === i; })) hl.push([er.from, '「' + er.name.replace(/（.*）/, '') + '」开始']); });
      hl.sort(function (a, b) { return a[0] - b[0]; });
      const tl = h('div', { class: 'ms2-tl' });
      hl.forEach(function (e, k) {
        const ek = eraList.length ? Math.max(0, eraAt(+e[0])) : -1, first = ek >= 0 && (k === 0 || Math.max(0, eraAt(+hl[k - 1][0])) !== ek), er = eraList[ek];
        const col = ek >= 0 ? UI.ERA_COLORS[ek % UI.ERA_COLORS.length] : null;
        if (first) { const eh = h('div', { class: 'ms2-era' }, h('b', null, er.name.replace(/（.*）/, '')), h('small', null, er.from + (eraList[ek + 1] ? '–' + (eraList[ek + 1].from - 1) : ' 起'))); eh.style.setProperty('--ec', col); tl.appendChild(eh); }
        const ev = h('div', { class: 'ms2-ev' + (k === 0 ? ' start' : ''), style: { animationDelay: (0.03 * Math.min(k, 10)) + 's' } }, h('b', null, String(e[0])), h('i'), h('span', null, e[1]));
        if (col) ev.style.setProperty('--ec', col);
        tl.appendChild(ev);
      });
      // 开始方式：经营挑战（主按钮）、自由建造（展开选项）、继续、读取存档
      const acts = h('div', { class: 'ms2-acts' });
      if (mp.tutorial) acts.appendChild(modeBtn('free', 'play', 'b-teal', '开始教程', '主线 13 步、约 12 分钟：规划、管理与经营（不限资金）', true));
      else {
        const ch = modeBtn('challenge', 'trophy', 'b-gold', '经营挑战', '初始资金 ' + U.fmtMoney(mp.cfg.economy.startFunds, undefined, mp.cfg.money), true);
        ch.dataset.tip = '新游戏 · 拨款随城市经济变化'; acts.appendChild(ch);
        acts.append.apply(acts, freeParts());
      }
      acts.appendChild(h('button', { class: 'map-mode sub', disabled: latest ? null : true, 'data-tip': latest ? latest.name + ' · ' + fmtDate(latest) : null, onclick: function () { if (latest) self.loadSlot(latest.slotId); } },
        h('span', { class: 'badge b-blue' }, ic('clock')), h('span', { class: 'grow' }, h('b', null, mp.tutorial ? '继续教程' : '继续游戏'), h('small', null, latest ? latest.name + ' · ' + fmtDate(latest) : '该地图还没有存档')), ic('chev', 16)));
      acts.appendChild(h('button', { class: 'map-mode sub', onclick: function () { self.showSaveManager(false, sel); } },
        h('span', { class: 'badge b-slate' }, ic('folder')), h('span', { class: 'grow' }, h('b', null, '读取存档'), h('small', null, games.length ? games.length + ' 个进度 · 可导入存档文件' : '暂无存档 · 可导入存档文件')), ic('chev', 16)));
      const progress = games.length ? games.length + ' 个进度 · 最近 ' + (latest ? fmtDate(latest) : '—') : (mp.tutorial ? '还没有开始教程' : '还没有进度');
      return h('div', { class: 'ms2-sheet' },
        poster,
        h('div', { class: 'ms2-body' },
          h('div', { class: 'ms2-col' }, h('div', { class: 'ms2-h' }, ic('info', 14), '城市概况'), h('p', { class: 'ms2-intro' }, mp.intro || mp.desc), h('div', { class: 'ms2-h' }, ic('sparkle', 14), '地图特色'), feats),
          h('div', { class: 'ms2-col ms2-tlcol' }, h('div', { class: 'ms2-h' }, ic('calYear', 14), '大事年表'), tl)),
        h('div', { class: 'ms2-actbar' }, h('div', { class: 'ms2-acth' }, h('b', null, mp.tutorial ? '开始教程' : '开始规划 ' + (mp.name || '')), h('span', { class: 'tiny muted' }, ic('save', 12), progress)), acts));
    };
    let first = true;
    const drawStage = function () {
      self._mapSel = sel;
      for (const id in items) { items[id].classList.toggle('on', id === sel); items[id].setAttribute('aria-selected', id === sel ? 'true' : 'false'); }
      const nd = buildStage();
      if (!first) nd.classList.add('swap-in');
      stage.replaceChildren(nd);
      first = false;
    };
    const pick = function (id, quiet) {
      if (sel === id) return;
      sel = id; if (!quiet) snd('soft');
      drawStage();
      const it = items[id]; if (it && it.scrollIntoView) it.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    };

    const rail = h('aside', { class: 'ms2-rail' },
      h('div', { class: 'ms2-head' }, h('button', { class: 'iconbtn', 'data-tip': '返回主菜单', 'data-key': 'Esc', onclick: back }, ic('back')), h('h2', null, '选择地图'), h('span', { class: 'grow' }), count),
      h('div', { class: 'ms2-search' }, ic('search', 16), search, clear),
      filters,
      h('div', { class: 'ms2-lh' }, h('span', null, '由易到难'), h('span', { class: 'tiny muted' }, '↑↓ 切换 · Enter 开始')),
      list,
      h('div', { class: 'ms2-note' }, '每张地图的进度与存档各自独立；进入游戏时默认暂停，可以先规划线路。'));
    const root = h('div', { class: 'ms2', tabindex: '-1' }, rail, stage);
    // 键盘：↑↓ 切换地图，Enter 开始（主按钮）
    root.addEventListener('keydown', function (e) {
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp' && e.key !== 'Enter') return;
      if (e.key === 'Enter') { if (e.target === search || e.target === root) { e.preventDefault(); goPrimary(); } return; }
      const vis = all.filter(function (id) { return !items[id].classList.contains('hidden-el'); });
      if (!vis.length) return;
      e.preventDefault();
      const k = vis.indexOf(sel), n = vis[(k + (e.key === 'ArrowDown' ? 1 : -1) + vis.length) % vis.length];
      pick(n);
    });
    drawStage(); drawList();
    this.openScreen(root, back, 'msel2', tr || 'fwd');
    requestAnimationFrame(function () { root.focus({ preventScroll: true }); const it = items[sel]; if (it) it.scrollIntoView({ block: 'nearest' }); });
  };

  // ======================== 开局简报 ========================
  // 新开存档时：这座城市当时的交通格局、你的起点与首批任务；之后可在日期面板或菜单中再次查看
  UI.prototype.showBriefing = function (after) {
    const self = this, g = this.g(), D = CM.DATA, B = D.briefing, mp = CM.curMap();
    if (!g || !B) { if (after) after(); return; }
    const theme = document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
    const done = function () { self.closeScreen(); if (after) after(); };
    const city = g.city, tot = city.totals();
    let open = 0, regs = 0; for (let k = 0; k < city.regions.length; k++) { if (city.regions[k].scenic) continue; regs++; if (city.regionOpen[k]) open++; }
    // 自由建造自定义起始年份：标题用起始年份，开局交通格局（描述地图原始开局年份）换成当时所处发展阶段的背景
    const y0 = g.startYear || CFG.START.y, late = y0 > CFG.START.y, era = late && CM.Eras ? CM.Eras.current(y0) : null;
    const hero = h('div', { class: 'brief-hero' }, CM.thumbInto(h('img', { alt: '' }), mp.id, theme),
      h('div', { class: 'brief-hero-tx' }, h('div', { class: 'msel-kicker' }, h('span', null, '开局简报'), h('i'), h('span', null, y0 + ' 年 1 月')), h('h2', null, (D.city || mp.name) + ' · ' + y0), h('div', { class: 'msel-tagline' }, mp.tagline || '')));
    const parts = [hero];
    // 东京等：开局接管既有地铁
    if (B.inherit && g.mapInit && g.mapInit.metro) {
      const n = CM.Milestones ? CM.Milestones.netInfo(g) : null, lines = Object.values(g.net.lines), L = lines[0];
      parts.push(h('div', { class: 'brief-inherit', style: { '--lc': L ? CM.Accessibility.line(L) : 'var(--accent)' } },
        h('span', { class: 'bi-line' }), h('span', { class: 'badge' }, ic('train')),
        h('div', { class: 'grow' }, h('b', null, '你接管了' + (lines.length ? lines.map(l => l.name).join('与') : '既有地铁')), h('small', null, g.mapInit.metro)),
        h('div', { class: 'bi-stats' },
          h('div', null, h('b', null, String(Object.keys(g.net.stations).length)), h('span', null, '座车站')),
          n ? h('div', null, h('b', null, U.fmtNum(n.km, 1)), h('span', null, '公里')) : null,
          g.model.daily && g.model.daily.metro ? h('div', null, h('b', null, U.fmtPeople(g.model.daily.metro)), h('span', null, '日客运（人次）')) : null)));
    }
    if (era) {
      parts.push(h('div', { class: 'msel-sec' }, ic('book', 15), '发展阶段：' + era.name));
      parts.push(h('p', { class: 'brief-lead' }, era.summary));
    } else {
      parts.push(h('p', { class: 'brief-lead' }, B.lead));
      parts.push(h('div', { class: 'msel-sec' }, ic('bus', 15), '当前交通格局'));
      parts.push(h('div', { class: 'brief-modes' }, (B.modes || []).map(function (m, k) {
        return h('div', { class: 'brief-mode', style: { animationDelay: (0.05 * k) + 's' } }, h('span', { class: 'badge ' + ['b-blue', 'b-teal', 'b-orange', 'b-violet'][k % 4] }, ic(m[0])), h('div', null, h('b', null, m[1]), h('small', null, m[2])));
      })));
    }
    // 开局之后再次查看：起点数据改为当前情况
    const atStart = g.history.length <= 1;
    parts.push(h('div', { class: 'msel-sec' }, ic('flag', 15), atStart ? '你的起点' : '现在（' + g.clock.y + '年' + g.clock.m + '月）'));
    const free = g.econ.isFree();
    parts.push(h('div', { class: 'msel-facts brief-facts' },
      h('div', null, h('span', null, '模式'), h('b', null, free ? '自由建造' : '经营挑战')),
      h('div', null, h('span', null, free ? '资金' : '可用资金'), h('b', null, free ? '不限' : U.fmtMoney(g.econ.funds))),
      h('div', null, h('span', null, '人口'), h('b', null, U.fmtPeople(tot.pop))),
      h('div', null, h('span', null, '已开放区域'), h('b', null, open + ' / ' + regs)),
      h('div', null, h('span', null, '票价'), h('b', null, UI.fareText(g.econ.fare).replace('/次', ''))),
      g.macro && CM.Macro ? (function () { const mv = CM.Macro.view(g); return h('div', { 'data-tip': '地图范围的经济规模（估算），每年 1 月结算上一年' }, h('span', null, '城市经济'), h('b', null, (mv.last ? mv.last.y + ' 年 ' + UI.fmtBig(mv.last.nom) : '约 ' + UI.fmtBig(mv.fc.nom)) + ' · ' + mv.env.label)); })() : null));
    const tasks = (g.tasks.active || []).slice(0, 3);
    if (tasks.length) {
      parts.push(h('div', { class: 'msel-sec' }, ic('tasks', 15), atStart ? '首批任务' : '进行中的任务'));
      parts.push(h('div', { class: 'brief-tasks' }, tasks.map(function (t) { return h('div', null, ic('flag', 14), h('b', null, t.title), t.deadline ? h('span', null, '截止 ' + t.deadline[0] + '年' + t.deadline[1] + '月') : null); })));
    }
    const card = h('div', { class: 'card brief' },
      h('div', { class: 'brief-scroll' }, parts),
      h('div', { class: 'brief-acts' },
        h('span', { class: 'tiny muted grow' }, '游戏已暂停。之后可在日期面板或菜单中再次查看简报。'),
        h('button', { class: 'btn', onclick: function () { self.closeScreen(); self.openPage('tasks', null, { root: true }); } }, ic('tasks'), '查看任务'),
        h('button', { class: 'btn primary', onclick: done }, '开始规划', ic('arrowR'))));
    this.openScreen(card, done, 'brief-screen');
  };

  // ======================== 经济知识：经营挑战的财政与债券（v2.3 改为图文分页；教程与操作说明中可回看；只说明，不实际发行） ========================
  // 每页一张手绘简图（sketch.js）+ 两三句短话，← → 翻页
  UI.econSlides = function () {
    return [
      { sketch: 'moneyIn', title: '钱从哪里来', lines: ['政府拨款：每月初发一次，开局时是最大的一笔。', '票款：每天按乘客数和票价结算。', '车站商业与政府合同：后面两页细说；任务奖励在完成时一次发放。'] },
      { sketch: 'grant', title: '拨款怎么算', lines: ['拨款 = 基础额度 × 财力 × 满意度 × 任务 × 履约信誉。', '乘客越满意、任务完成得越好，拨款越多；任务没按期完成会打折一段时间（历史任务 12 个月，动态任务 6 个月）。'], note: '满意度系数 = 0.6 + 0.8 × 满意度 ÷ 100；几项任务同时打折时，任务系数最低 ×0.7；政府合同开放后才计履约信誉（×0.95–1.05）。' },
      { sketch: 'moneyOut', title: '钱花在哪里', lines: ['建设与拆迁：确认建设时一次付清；新线随线配车的费用也算在里面。', '运营：列车和车站每天都要花钱，线越长、站越多越贵。', '客流少的线也要付运营费，所以先修人多的地方。'] },
      { sketch: 'fleetCost', title: '列车也是一笔账', lines: ['列车按车型整列购买，买车计入建设支出；不用的列车可以调到别的线，或按残值出售。', '运营费按车厢公里算：投入的列车越多、编组越长越贵，新车型更省，超过设计寿命 ×1.25。', '运行速度越高运营费越贵，所以不是每条线都要跑得快。'] },
      { sketch: 'fare', title: '票价的取舍', lines: ['票价高，每位乘客付得多，但坐地铁的人会变少，满意度也会下降。', '默认按里程计费：长途多付，短途便宜。', '缺钱时小步上调，调完看看客流变化。'] },
      { sketch: 'tod', title: '车站商业（TOD）', lines: ['接入运营的车站可以逐级开发：广告与便利店、站内商业街、站城一体。', '收入随客流和经济周期涨落；开发后每年有运营与维护成本，客流太少会亏损。', '大客流的换乘站回本最快，也会吸引周边的人口与岗位。'], note: '车站详情和地铁芯都能开发，每一级都标出收入、成本与回本年数；财政页列出亏损的车站。' },
      { sketch: 'contract', title: '政府合同（PPP）', lines: ['开局满 3 年、线网超过 12 km，并到了本城开放合同的年份后，政府开始招标：新线、铁路＋物业和扩容改造。', '可以投标、放弃或自己建：中标先交保证金，自己出资建设，按期完工收补助并退保证金。', '运营期按服务水平收可用性付费，客流差额双方分担；违约会扣钱、打折拨款、降低信誉。'], note: '三档报价越便宜越容易中标，风险也越大；履约信誉影响中标率和每月拨款。在任务页的「合同」分页投标。' },
      { sketch: 'econ', title: '城市经济', lines: ['真实城市模拟 GDP、经济周期和历史上的经济危机，每年 1 月结算。', '上一年财政好，今年拨款的财力系数就高（×0.70–1.30）；衰退时车站商业收入也会下降。', '好的地铁能小幅提高生产率，但抵消不了外部危机。'] },
      { sketch: 'bonds', title: '债券融资', lines: ['地方债利率低、额度大；城投债利率高、额度小。', '借来的钱进入「建设专项资金」，只能修地铁和买车，不能付运营费或利息。', '期限 3 年或 6 年，利率发行时锁定，每年付息、到期还本。'] },
      { sketch: 'overdue', title: '还不上会怎样', lines: ['利息和本金从一般资金付，不够的部分记为逾期。', '逾期每月加收费用并暂停城投债；满 6 个月暂停全部发债。', '一般资金有余额时会自动还清；失败只看长期负余额、负债下限与满意度。'] },
      { sketch: 'howto', title: '怎么操作', lines: ['点顶栏「资金」打开「财政与经济」：票价在「财政」页，发债在「融资」页。', '列车、车站规模和商业开发都在右下角的「地铁芯」；投标在任务页的「合同」分页。', '统计窗口（' + (CM.Keys.hint('ui.stats') || '未绑定') + '）的「经济」页有历年图表。'], note: '青湾教程是自由建造（资金不限），这里只做说明，不会实际发行债券。' },
    ];
  };
  // 操作说明里的入口：页标题一览 + 打开图文分页
  UI.prototype.econGuide = function () {
    const self = this;
    return h('div', { class: 'eg' },
      h('div', { class: 'eg-toc' }, UI.econSlides().map(function (s, i) { return h('span', null, (i + 1) + '. ' + s.title); })),
      h('button', { class: 'btn sm primary', onclick: function () { self.showEconGuide(); } }, ic('book', 14), '打开图文说明（' + UI.econSlides().length + ' 页）'));
  };
  UI.prototype.showEconGuide = function (onClose) {
    this.showSlides('经营挑战的财政', UI.econSlides(), { sub: '经济小知识 · 可随时回看', icon: 'coin', onClose: onClose });
  };

  // ======================== 更新公告 ========================
  UI.prototype.showNews = function (onBack) {
    const self = this;
    const close = function () { if (onBack) onBack(); else self.closeScreen(); };
    markNews();
    const list = h('div', { class: 'news-list' });
    (CM.NEWS || []).forEach(function (v, k) {
      // 每个版本只列主要变化（篇幅统一）
      const body = h('ul', { class: 'news-b' }, (v.items || []).map(function (t) { return h('li', null, t); }));
      // 复用详情面板的折叠区块：最新版本默认展开
      const key = 'news-' + v.v;
      if (self.open[key] === undefined) self.open[key] = k === 0;
      const sec = self.sec(key, '', '', function () { return body; }, k === 0);
      const head = sec.querySelector('.sec-h');
      // 原生 replaceChildren 会把 null 写成文字，这里只传实际存在的节点
      head.replaceChildren.apply(head, [h('span', { class: 'news-v' + (k === 0 ? ' cur' : '') }, 'V' + v.v), h('span', { class: 'news-t' }, v.title), k === 0 ? h('span', { class: 'tag good' }, '最新') : null, h('span', { class: 'news-d' }, v.date), ic('chev', 14, 'chev')].filter(Boolean));
      list.appendChild(sec);
    });
    const card = h('div', { class: 'card news' },
      h('div', { class: 'card-head' }, h('span', { class: 'badge b-violet' }, ic('megaphone')), h('div', { class: 'grow' }, h('h2', null, '更新公告'), h('div', { class: 'tiny muted' }, '当前版本 V' + ((CM.NEWS || [])[0]?.v || CFG.GAME_VERSION))),
        h('button', { class: 'iconbtn', 'data-tip': '关闭', 'data-key': 'Esc', onclick: close }, ic('close'))),
      list);
    this.openScreen(card, close);
  };
})(window.CM);
