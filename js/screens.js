'use strict';
// 全屏界面：开始界面、选择地图（左侧预览与选择、右侧详情，搜索与筛选）、开局简报、更新公告
(function (CM) {
  const U = CM.U, CFG = CM.CFG, UI = CM.UI;
  const h = U.h, ic = CM.icon;
  const snd = function (name) { if (CM.Sound) CM.Sound.play(name); };
  const LEVEL = ['入门', '普通', '进阶', '挑战'];
  const REGION_ORDER = ['中国内地', '中国香港', '中国台湾', '日本', '英国', '虚构'];

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

  // ======================== 开始界面 ========================
  // 标题装饰：线路、车站与城市剪影
  const TITLE_DECO = '<svg class="title-deco" viewBox="0 0 400 34" preserveAspectRatio="xMinYMid meet" aria-hidden="true"><path d="M150 22 H222 M290 22 H392" stroke="currentColor" stroke-width="2" stroke-linecap="round" opacity=".55"/>' +
    '<circle cx="168" cy="22" r="4.5" style="fill:var(--bg)" stroke="currentColor" stroke-width="2.4"/><circle cx="208" cy="22" r="4.5" style="fill:var(--bg)" stroke="currentColor" stroke-width="2.4"/>' +
    '<g fill="currentColor"><rect x="228" y="12" width="7" height="12" rx="1"/><rect x="237" y="6" width="8" height="18" rx="1"/><rect x="247" y="0" width="8" height="24" rx="1"/><rect x="257" y="8" width="7" height="16" rx="1"/><rect x="266" y="3" width="8" height="21" rx="1"/><rect x="276" y="13" width="7" height="11" rx="1"/></g>' +
    '<circle cx="308" cy="22" r="4.5" style="fill:var(--bg)" stroke="currentColor" stroke-width="2.4"/><circle cx="348" cy="22" r="4.5" style="fill:var(--bg)" stroke="currentColor" stroke-width="2.4"/></svg>';

  UI.prototype.showStart = function () {
    const self = this;
    const latest = CM.Save.latest();
    const storageOk = CM.Save.available();
    const btn = function (icon, label, onclick, opts) {
      opts = opts || {};
      return h('button', { class: 'start-btn' + (opts.primary ? ' primary' : ''), disabled: opts.disabled ? true : null, onclick: onclick },
        ic(icon), h('span', { class: 'lb' }, label), opts.sub ? h('span', { class: 'sub' }, opts.sub) : null, ic('chev', 18, 'chev'));
    };
    const title = h('h1', { class: 'start-title' }, '城市', h('span', { class: 'yu' }, '与'), '地铁');
    const wrap = h('div', { class: 'start-wrap' },
      title, h('div', { html: TITLE_DECO }),
      h('div', { class: 'start-menu' },
        btn('play', '开始游戏', function () { self.showMapSelect(); }, { primary: true, sub: '选择地图' }),
        btn('clock', '继续游戏', function () { if (latest) self.loadSlot(latest.slotId); }, { disabled: !latest, sub: latest ? ((CM.MAPS[latest.map || 'gz'] || {}).name || '') + ' · ' + latest.date[0] + '年' + latest.date[1] + '月' : '暂无存档' }),
        btn('gear', '设置', function () { self.showSettings(); }),
        btn('power', '退出', function () { self.quitGame(); })),
      CM.MAPS.tutorial ? h('button', { class: 'start-learn', onclick: function () { self.showMapSelect('tutorial'); } }, ic('help', 16), h('span', null, '第一次玩？先试试'), h('b', null, '新手教程 · 青湾'), ic('chev', 14)) : null,
      !storageOk ? h('div', { class: 'callout bad', style: { marginTop: '14px' } }, ic('error'), h('div', { class: 'ct' }, '当前浏览器禁止本地存储，进度将无法自动保存。')) : null,
      h('div', { class: 'start-foot' }, '规划地铁、改变出行、塑造城市。', h('br'),
        h('a', { href: 'LICENSE.txt', target: '_blank', rel: 'noopener' }, '© 2026 VinsonFung · 仅限非商业使用'), h('br'),
        h('a', { href: 'https://www.openstreetmap.org/copyright', target: '_blank', rel: 'noopener' }, '地图 © OpenStreetMap 贡献者 · ODbL'), ' · v' + CFG.GAME_VERSION));
    // 右上角：更新公告 + 深浅模式（同一组按钮）
    const news = h('button', { class: 'corner-btn' + (newsSeen() ? '' : ' dot'), 'data-tip': '更新公告', 'aria-label': '更新公告', onclick: function () { self.showNews(function () { self.showStart(); }); } }, ic('megaphone'));
    this.startTheme = h('button', { class: 'corner-btn', 'aria-label': '切换深浅模式', onclick: function () { self.toggleTheme(); } });
    const corner = h('div', { class: 'start-corner' }, news, this.startTheme);
    this.openScreen(h('div', { class: 'start-root' }, wrap, corner), null, 'start');
    this.renderThemeBtns();
  };

  // ======================== 选择地图 ========================
  UI.prototype.showMapSelect = function (selId) {
    const self = this, all = CM.MAP_ORDER.slice();
    let sel = selId && CM.MAPS[selId] ? selId : (this._mapSel && CM.MAPS[this._mapSel] ? this._mapSel : all[0]);
    const F = this._mapFilter || (this._mapFilter = { q: '', era: 'all', region: 'all' });
    if (selId) { F.q = ''; F.era = 'all'; F.region = 'all'; }
    const theme = document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
    const eras = Array.from(new Set(all.map(function (id) { return eraOf(CM.MAPS[id]); }))).sort();
    const regions = REGION_ORDER.filter(function (r) { return all.some(function (id) { return CM.MAPS[id].region === r; }); });
    const back = function () { self.showStart(); };

    // ---- 左侧：搜索、筛选、地图列表 ----
    const search = h('input', { type: 'search', class: 'msel-q', placeholder: '搜索城市、年代或特色', 'aria-label': '搜索地图', value: F.q, autocomplete: 'off' });
    const clear = h('button', { class: 'iconbtn sm', 'data-tip': '清除', 'aria-label': '清除搜索', onclick: function () { search.value = ''; F.q = ''; clear.classList.add('gone'); drawList(); search.focus(); } }, ic('close', 15));
    if (!F.q) clear.classList.add('gone');
    search.addEventListener('input', function () { F.q = search.value.trim(); clear.classList.toggle('gone', !F.q); drawList(); });
    const chipRow = function (label, icon, key, opts) {
      const row = h('div', { class: 'msel-frow' }, h('span', { class: 'msel-fl' }, ic(icon, 14), label));
      const chips = h('div', { class: 'fchips' });
      for (const o of opts) {
        const b = h('button', { class: 'fchip' + (F[key] === o[0] ? ' on' : ''), 'data-silent': '1', 'data-v': o[0], onclick: function () {
          if (F[key] === o[0]) return;
          F[key] = o[0]; snd('soft');
          chips.querySelectorAll('.fchip').forEach(function (x) { x.classList.toggle('on', x.dataset.v === F[key]); });
          drawList();
        } }, o[1]);
        chips.appendChild(b);
      }
      row.appendChild(chips);
      return row;
    };
    const filters = h('div', { class: 'msel-filters' },
      chipRow('年代', 'calYear', 'era', [['all', '全部']].concat(eras.map(function (e) { return [String(e), eraName(e)]; }))),
      chipRow('地区', 'globe', 'region', [['all', '全部']].concat(regions.map(function (r) { return [r, r]; }))));
    const list = h('div', { class: 'msel-list', role: 'listbox', 'aria-label': '地图' });
    const empty = h('div', { class: 'msel-empty hidden-el' }, ic('search', 22), h('b', null, '没有符合条件的地图'), h('span', null, '换个关键词，或把筛选改回「全部」。'),
      h('button', { class: 'btn sm', onclick: function () { F.q = ''; F.era = 'all'; F.region = 'all'; self.showMapSelect(sel); } }, '清除筛选'));
    const count = h('span', { class: 'msel-count' });
    const items = {};
    const text = function (mp) { return [mp.title, mp.name, mp.sub, mp.tagline, mp.region, eraName(eraOf(mp)), String(mp.cfg.START.y), (mp.tags || []).join(' '), mp.data.city].join(' ').toLowerCase(); };
    const match = function (id) {
      const mp = CM.MAPS[id];
      if (F.era !== 'all' && String(eraOf(mp)) !== F.era) return false;
      if (F.region !== 'all' && mp.region !== F.region) return false;
      if (F.q) { const t = text(mp); for (const w of F.q.toLowerCase().split(/\s+/)) if (w && t.indexOf(w) < 0) return false; }
      return true;
    };
    for (const id of all) {
      const mp = CM.MAPS[id], n = CM.Save.list(id).length;
      const it = h('button', { class: 'msel-item', role: 'option', 'data-id': id, onclick: function () { pick(id); }, ondblclick: function () { pick(id); const p = detail.querySelector('.map-mode.primary'); if (p) p.click(); } },
        h('span', { class: 'msel-thumb' }, h('img', { alt: '', src: CM.mapThumb(id, theme) || '' }), mp.tutorial ? h('span', { class: 'msel-flag' }, '教程') : null),
        h('span', { class: 'msel-it' },
          h('b', null, mp.title || mp.name),
          h('small', null, mp.tagline || mp.sub),
          h('span', { class: 'msel-meta' }, h('span', { class: 'tag' }, mp.region || ''), levelEl(mp.difficulty || 2), n ? h('span', { class: 'msel-prog' }, ic('save', 12), n + ' 个进度') : null)));
      items[id] = it; list.appendChild(it);
    }
    list.appendChild(empty);
    const drawList = function () {
      let shown = 0;
      for (const id of all) { const ok = match(id); items[id].classList.toggle('hidden-el', !ok); if (ok) shown++; }
      empty.classList.toggle('hidden-el', shown > 0);
      count.textContent = shown === all.length ? '共 ' + all.length + ' 张地图' : '找到 ' + shown + ' / ' + all.length + ' 张';
      // 当前选中的地图被筛掉时，选中第一张可见的地图
      if (shown && items[sel].classList.contains('hidden-el')) { const first = all.find(function (id) { return !items[id].classList.contains('hidden-el'); }); if (first) pick(first, true); }
    };

    // ---- 右侧：详情 ----
    const detail = h('div', { class: 'msel-detail' });
    const fmtDate = function (sl) { return sl.date[0] + '年' + sl.date[1] + '月'; };
    const buildDetail = function () {
      const mp = CM.MAPS[sel], games = CM.Save.list(sel), latest = CM.Save.latest(sel), y0 = mp.cfg.START.y;
      const start = function (mode) {
        snd('build');
        if (mp.tutorial) CM.newGame({ map: sel, mode: 'free', tutorial: true, name: '新手教程 · ' + mp.data.city });
        else CM.newGame({ map: sel, mode: mode, name: (mode === 'free' ? '自由建造' : '经营挑战') + ' · ' + mp.data.city + ' ' + y0 });
      };
      const modeBtn = function (mode, icon, badge, title, desc, primary) {
        return h('button', { class: 'map-mode' + (primary ? ' primary' : ''), onclick: function () { start(mode); } },
          h('span', { class: 'badge ' + badge }, ic(icon)), h('span', { class: 'grow' }, h('b', null, title), h('small', null, desc)), ic('chev', 16));
      };
      const hero = h('div', { class: 'msel-hero' },
        h('img', { alt: '', src: CM.mapThumb(sel, theme) || '' }),
        h('div', { class: 'msel-hero-tx' },
          h('div', { class: 'msel-kicker' }, h('span', null, mp.region || ''), h('i'), h('span', null, y0 + ' 年起'), h('i'), h('span', null, mp.kind === 'fictional' || mp.tutorial ? '虚构城市' : '真实地理')),
          h('h2', null, mp.title || mp.name),
          h('div', { class: 'msel-tagline' }, mp.tagline || mp.sub),
          h('div', { class: 'msel-chips' }, levelEl(mp.difficulty || 2), (mp.tags || []).map(function (t) { return h('span', { class: 'tag glass-tag' }, t); }))));
      // 要点：范围、起始、人口、货币等；真实城市另列开局时地图范围的经济规模（城市经济模拟的起点，估算）
      const fl = (mp.facts || []).filter(function (f) { return f[0] !== '模式'; }).slice();
      const mc = mp.cfg.macro && mp.cfg.macro !== 'auto' ? mp.cfg.macro : null;
      if (mc && mc.gdp0) { const mo = mp.cfg.money, v = mc.gdp0; fl.push(['开局 GDP', '约 ' + (v >= 1e8 ? (v / 1e8).toFixed(2) + ' 万' + mo.yi : U.fmtMoney(v, 0, mo))]); }
      const facts = h('div', { class: 'msel-facts' }, fl.map(function (f) { return h('div', null, h('span', null, f[0]), h('b', { title: f[1] }, f[1])); }));
      const feats = h('div', { class: 'msel-feats' }, (mp.features || []).map(function (f, k) {
        return h('div', { class: 'msel-feat', style: { animationDelay: (0.04 * k) + 's' } }, h('span', { class: 'badge ' + ['b-blue', 'b-teal', 'b-orange', 'b-violet'][k % 4] }, ic(f[0])), h('div', null, h('b', null, f[1]), h('small', null, f[2])));
      }));
      // 大事年表：开局 + 本地图的关键历史节点
      const hl = [[y0, '开局']].concat(mp.highlights || []);
      const tl = h('div', { class: 'msel-tl' }, hl.map(function (e, k) {
        return h('div', { class: 'msel-ev' + (k === 0 ? ' start' : '') }, h('b', null, String(e[0])), h('i'), h('span', null, e[1]));
      }));
      const acts = h('div', { class: 'map-actions' });
      if (mp.tutorial) acts.appendChild(modeBtn('free', 'play', 'b-teal', '开始教程', '从头开始 12 个引导任务（不限资金）', true));
      else {
        acts.appendChild(modeBtn('challenge', 'trophy', 'b-gold', '经营挑战', '新游戏 · 初始资金 ' + U.fmtMoney(mp.cfg.economy.startFunds, undefined, mp.cfg.money) + '，拨款随城市经济变化', true));
        acts.appendChild(modeBtn('free', 'sparkle', 'b-teal', '自由建造', '新游戏 · 资金不限，任务仅供参考', false));
      }
      acts.appendChild(h('button', { class: 'map-mode sub', disabled: latest ? null : true, 'data-tip': latest ? latest.name + ' · ' + fmtDate(latest) : null, onclick: function () { if (latest) self.loadSlot(latest.slotId); } },
        h('span', { class: 'badge b-blue' }, ic('clock')), h('span', { class: 'grow' }, h('b', null, mp.tutorial ? '继续教程' : '继续游戏'), h('small', null, latest ? latest.name + ' · ' + fmtDate(latest) : '该地图还没有存档')), ic('chev', 16)));
      acts.appendChild(h('button', { class: 'map-mode sub', onclick: function () { self.showSaveManager(false, sel); } },
        h('span', { class: 'badge b-slate' }, ic('folder')), h('span', { class: 'grow' }, h('b', null, '读取存档'), h('small', null, games.length ? games.length + ' 个进度 · 可导入存档文件' : '暂无存档 · 可导入存档文件')), ic('chev', 16)));
      // 详情按区块分组：概况（介绍与要点）、地图特色、大事年表；底部为本图操作区
      const block = function (icon, badge, title, kids, cls) { return h('section', { class: 'msel-block ' + (cls || '') }, h('div', { class: 'msel-bh' }, h('span', { class: 'badge ' + badge }, ic(icon, 15)), h('b', null, title)), kids); };
      const progress = games.length ? games.length + ' 个进度 · 最近 ' + (latest ? fmtDate(latest) : '—') : (mp.tutorial ? '还没有开始教程' : '还没有进度');
      return h('div', { class: 'msel-dwrap' },
        h('div', { class: 'msel-scroll' }, hero,
          block('info', 'b-blue', '城市概况', [h('p', { class: 'msel-intro' }, mp.intro || mp.desc), facts], 'intro'),
          block('sparkle', 'b-violet', '地图特色', feats),
          block('calYear', 'b-orange', '大事年表', tl)),
        h('div', { class: 'msel-actbar' }, h('div', { class: 'msel-acth' }, h('b', null, mp.tutorial ? '开始教程' : '开始规划 ' + (mp.name || '')), h('span', { class: 'tiny muted' }, ic('save', 12), progress)), acts));
    };
    let first = true;
    const drawDetail = function () {
      self._mapSel = sel;
      for (const id in items) { items[id].classList.toggle('on', id === sel); items[id].setAttribute('aria-selected', id === sel ? 'true' : 'false'); }
      const nd = buildDetail();
      if (!first) nd.classList.add('swap-in');
      detail.replaceChildren(nd);
      first = false;
    };
    const pick = function (id, quiet) {
      if (sel === id) return;
      sel = id; if (!quiet) snd('soft');
      drawDetail();
      const it = items[id]; if (it && it.scrollIntoView) it.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    };

    const left = h('div', { class: 'msel-left' },
      h('div', { class: 'msel-head' }, h('button', { class: 'iconbtn', 'data-tip': '返回主菜单', 'data-key': 'Esc', onclick: back }, ic('back')), h('h2', null, '选择地图'), h('span', { class: 'grow' }), count),
      h('div', { class: 'msel-filterbox' }, h('div', { class: 'msel-search' }, ic('search', 16), search, clear), filters),
      h('div', { class: 'msel-lh' }, ic('map', 14), '地图', h('span', { class: 'tiny muted' }, '由易到难 · ↑↓ 切换 · Enter 开始')),
      list,
      h('div', { class: 'msel-note' }, '每张地图的进度与存档各自独立；进入游戏时默认暂停，可以先规划线路。'));
    const card = h('div', { class: 'card msel', tabindex: '-1' }, left, detail);
    // 键盘：↑↓ 切换地图，Enter 开始（主按钮）
    card.addEventListener('keydown', function (e) {
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp' && e.key !== 'Enter') return;
      if (e.key === 'Enter') { if (e.target === search || e.target === card) { const p = detail.querySelector('.map-mode.primary'); if (p) { e.preventDefault(); p.click(); } } return; }
      const vis = all.filter(function (id) { return !items[id].classList.contains('hidden-el'); });
      if (!vis.length) return;
      e.preventDefault();
      const k = vis.indexOf(sel), n = vis[(k + (e.key === 'ArrowDown' ? 1 : -1) + vis.length) % vis.length];
      pick(n);
    });
    drawDetail(); drawList();
    this.openScreen(card, back, 'msel-screen');
    requestAnimationFrame(function () { card.focus({ preventScroll: true }); const it = items[sel]; if (it) it.scrollIntoView({ block: 'nearest' }); });
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
    const y0 = CFG.START.y;
    const hero = h('div', { class: 'brief-hero' }, h('img', { alt: '', src: CM.mapThumb(mp.id, theme) || '' }),
      h('div', { class: 'brief-hero-tx' }, h('div', { class: 'msel-kicker' }, h('span', null, '开局简报'), h('i'), h('span', null, y0 + ' 年 1 月')), h('h2', null, (D.city || mp.name) + ' · ' + y0), h('div', { class: 'msel-tagline' }, mp.tagline || '')));
    const parts = [hero];
    // 东京等：开局接管既有地铁
    if (B.inherit && g.mapInit && g.mapInit.metro) {
      const n = CM.Milestones ? CM.Milestones.netInfo(g) : null, L = Object.values(g.net.lines)[0];
      parts.push(h('div', { class: 'brief-inherit', style: { '--lc': (L && L.color) || 'var(--accent)' } },
        h('span', { class: 'bi-line' }), h('span', { class: 'badge' }, ic('train')),
        h('div', { class: 'grow' }, h('b', null, '你接管了' + (L ? L.name : '既有地铁')), h('small', null, g.mapInit.metro)),
        h('div', { class: 'bi-stats' },
          h('div', null, h('b', null, String(Object.keys(g.net.stations).length)), h('span', null, '座车站')),
          n ? h('div', null, h('b', null, U.fmtNum(n.km, 1)), h('span', null, '公里')) : null,
          g.model.daily && g.model.daily.metro ? h('div', null, h('b', null, U.fmtPeople(g.model.daily.metro)), h('span', null, '日客运（人次）')) : null)));
    }
    parts.push(h('p', { class: 'brief-lead' }, B.lead));
    parts.push(h('div', { class: 'msel-sec' }, ic('bus', 15), '当前交通格局'));
    parts.push(h('div', { class: 'brief-modes' }, (B.modes || []).map(function (m, k) {
      return h('div', { class: 'brief-mode', style: { animationDelay: (0.05 * k) + 's' } }, h('span', { class: 'badge ' + ['b-blue', 'b-teal', 'b-orange', 'b-violet'][k % 4] }, ic(m[0])), h('div', null, h('b', null, m[1]), h('small', null, m[2])));
    })));
    // 开局之后再次查看：起点数据改为当前情况
    const atStart = g.history.length <= 1;
    parts.push(h('div', { class: 'msel-sec' }, ic('flag', 15), atStart ? '你的起点' : '现在（' + g.clock.y + '年' + g.clock.m + '月）'));
    const free = g.econ.isFree();
    parts.push(h('div', { class: 'msel-facts brief-facts' },
      h('div', null, h('span', null, '模式'), h('b', null, free ? '自由建造' : '经营挑战')),
      h('div', null, h('span', null, free ? '资金' : '可用资金'), h('b', null, free ? '不限' : U.fmtMoney(g.econ.funds))),
      h('div', null, h('span', null, '人口'), h('b', null, U.fmtPeople(tot.pop))),
      h('div', null, h('span', null, '已开放区域'), h('b', null, open + ' / ' + regs)),
      h('div', null, h('span', null, '票价'), h('b', null, CFG.money.sym + g.econ.fare.flat)),
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

  // ======================== 经济知识：经营挑战的财政与债券（教程与操作说明中可回看；只说明，不实际发行） ========================
  UI.prototype.econGuide = function () {
    const sec = function (icon, badge, title, items) {
      return h('div', { class: 'eg-sec' }, h('div', { class: 'eg-h' }, h('span', { class: 'badge ' + badge }, ic(icon)), h('b', null, title)), h('ul', null, items.map(function (t) { return h('li', null, t); })));
    };
    return h('div', { class: 'eg' },
      sec('coin', 'b-green', '钱从哪里来', ['政府拨款：每月初发放一次，= 基础额度 × 财力系数 × 满意度系数 × 任务修正。', '票款：每天按乘客数与票价结算。', '任务奖励：完成历史与动态任务时发放。']),
      sec('trend', 'b-violet', '城市经济怎样影响拨款', ['真实城市会模拟地图范围的 GDP、经济周期和历史经济事件（如石油危机、亚洲金融危机、全球金融危机），每年 1 月结算上一年。', 'GDP 不等于财政收入：地方财政收入约为 GDP 的一定比例，其中只有一部分安排给地铁。上一年财政收入高于预期，当年拨款的财力系数就高于 1，反之低于 1（限定在 ×0.70–1.30）。', '好的地铁能缩短通勤、缓解拥堵、提高可达性，从而小幅提高生产率；但建了地铁不一定增长，也抵消不了外部危机。']),
      sec('hammer', 'b-orange', '钱花在哪里', ['建设与拆迁：确认建设时一次支付。', '运营成本：列车运行与车站，每天结算。线路越长、车站越多，成本越高。']),
      sec('wallet', 'b-violet', '债券融资', ['地方债利率较低、额度较大；城投债利率较高、额度较小。', '新发行的利率随年代的市场利率、经济环境和本市财政状况浮动：财政稳健时更低，负债偏高、财力不足或有逾期时更高。', '期限 3 年或 6 年，利率在发行时锁定，之后按合同付息，不受报价变化影响；每年付一次利息，到期一次还本。', '借来的钱不算收入：进入「建设专项资金」，只能用于地铁建设及改扩建，不能拿来付运营成本或利息。', '每年能发行的额度与总债务都有上限，随城市、年代与财力变化。']),
      sec('warn', 'b-red', '还不上会怎样', ['利息与本金从一般资金支付；资金不足的部分记为逾期。', '逾期每月收取额外费用，并暂停城投债；逾期满 6 个月暂停全部发债。', '不会因为一次逾期就失败，一般资金有余额时会自动还清。挑战失败只看长期负余额、负债下限与满意度。']),
      sec('cursor', 'b-blue', '怎么操作', ['点顶栏的「资金」打开「财政与经济」面板：概览、经济、财政、融资四个分页。', '在「融资」页查看利率报价与构成，点「发行债券」选择种类、期限与金额，确认前会显示每年利息与到期日。', '「经济」页列出 GDP、增长来源、交通对经济的影响与正在发生的经济事件；统计窗口（G）的「经济」页有历年图表。']),
      h('div', { class: 'note' }, '青湾教程使用自由建造（资金不限），不模拟城市经济，这里只做说明，不会实际发行债券。可以在「菜单 → 操作说明」中随时回看。'));
  };
  UI.prototype.showEconGuide = function (onClose) {
    const self = this, close = function () { self.closeScreen(); if (onClose) onClose(); };
    const card = h('div', { class: 'card eg-card' },
      h('div', { class: 'card-head' }, h('span', { class: 'badge b-gold' }, ic('coin')), h('div', { class: 'grow' }, h('h2', null, '经营挑战的财政'), h('div', { class: 'tiny muted' }, '经济小知识 · 可随时回看')), h('button', { class: 'iconbtn', 'data-tip': '关闭', 'data-key': 'Esc', onclick: close }, ic('close'))),
      this.econGuide(),
      h('div', { class: 'modal-actions' }, h('button', { class: 'btn primary', onclick: close }, '知道了')));
    this.openScreen(card, close);
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
      head.replaceChildren.apply(head, [h('span', { class: 'news-v' + (k === 0 ? ' cur' : '') }, 'v' + v.v), h('span', { class: 'news-t' }, v.title), k === 0 ? h('span', { class: 'tag good' }, '最新') : null, h('span', { class: 'news-d' }, v.date), ic('chev', 14, 'chev')].filter(Boolean));
      list.appendChild(sec);
    });
    const card = h('div', { class: 'card news' },
      h('div', { class: 'card-head' }, h('span', { class: 'badge b-violet' }, ic('megaphone')), h('div', { class: 'grow' }, h('h2', null, '更新公告'), h('div', { class: 'tiny muted' }, '当前版本 v' + CFG.GAME_VERSION)),
        h('button', { class: 'iconbtn', 'data-tip': '关闭', 'data-key': 'Esc', onclick: close }, ic('close'))),
      list);
    this.openScreen(card, close);
  };
})(window.CM);
