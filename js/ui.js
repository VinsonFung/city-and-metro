'use strict';
// 界面框架：顶部 HUD、图层坞、详情面板（概览 → 展开详情）、工具坞、草案栏、冲突处理、开始界面与对话框
(function (CM) {
  const AX = CM.Accessibility;
  const U = CM.U, CFG = CM.CFG, D = CM.DATA, M = CM.Metro;
  const h = U.h, I = CM.ICON, ic = CM.icon;
  const snd = function (name) { if (CM.Sound) CM.Sound.play(name); };

  // 分析图层（v1.9 起分为三组）：城市（人口、职住、设施出行需求、发展）· 交通（拥堵、出行方向、通勤时间、乘地铁比例）· 地铁（覆盖、车站客流、服务缺口、商业开发）
  const LAYER_GROUPS = [['city', '城市'], ['traffic', '交通'], ['metro', '地铁']];
  const LAYERS = [
    { id: 'pop', metric: true, group: 'city', name: '人口密度', icon: 'lyPop', color: '#e9641f', desc: '各街区常住人口' },
    { id: 'jobs', group: 'city', name: '住宅与就业', icon: 'lyJobs', color: '#6447dc', desc: '居住与岗位的分布' },
    { id: 'fac', group: 'city', name: '设施出行需求', icon: 'lyFac', color: '#c2410c', desc: '重要设施与各片区吸引的出行（按目的）' },
    { id: 'cong', metric: true, group: 'traffic', name: '道路拥堵', icon: 'lyCong', color: '#df3030', desc: '主要道路当前的拥堵程度' },
    { id: 'flow', group: 'traffic', name: '出行方向', icon: 'lyFlow', color: '#2557d6', desc: '各片区的主要出行方向' },
    { id: 'commute', group: 'traffic', name: '通勤时间', icon: 'timer', color: '#8a4fd3', desc: '住在各片区的人上班要花多久（门到门）' },
    { id: 'mshare', group: 'traffic', name: '乘地铁比例', icon: 'metro', color: '#0f7fb0', desc: '各片区居民的出行有多少乘地铁' },
    { id: 'cover', group: 'metro', name: '地铁覆盖', icon: 'lyCover', color: '#14a252', desc: '步行可达车站的范围与阻隔', metric: true },
    { id: 'station', group: 'metro', name: '车站客流', icon: 'lyStation', color: '#109e90', desc: '客流与运力负荷' },
    { id: 'gap', group: 'metro', name: '地铁服务缺口', icon: 'lyGap', color: '#b91c1c', desc: '出行需求大但地铁服务不足的地方' },
    { id: 'tod', group: 'metro', name: '商业开发', icon: 'bag', color: '#a8780c', desc: '已开发的车站、每月净收益与值得开发的车站' },
  ];
  UI.LAYERS = LAYERS;
  UI.weekdayName = function (ck) { const w = new Date(Date.UTC(ck.y, ck.m - 1, ck.d)).getUTCDay(); return ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][w] + (w === 0 || w === 6 ? '（周末）' : ''); };
  // 详情页图标与配色
  const PAGE_ICON = {
    build: ['hammer', 'b-blue'], station: ['station', 'b-teal'], line: ['route', 'b-blue'], road: ['car', 'b-orange'], zone: ['map', 'b-slate'],
    finance: ['coin', 'b-gold'], tasks: ['flag', 'b-violet'], date: ['clock', 'b-teal'], saves: ['save', 'b-blue'], help: ['help', 'b-slate'], data: ['info', 'b-slate'],
    metric: ['chart', 'b-blue'], multi: ['layers', 'b-blue'], facility: ['pin', 'b-orange'], guide: ['book', 'b-green'],
  };
  const METRIC_ICON = { pop: ['people', 'b-blue'], share: ['metro', 'b-teal'], cong: ['car', 'b-orange'], commute: ['timer', 'b-violet'], sat: ['smile', 'b-green'] };
  // 统一交互反馈的范围：按钮、可点击的行与卡片、列表选项与标签页
  const PRESS_SEL = 'button, .clickable, [role="option"], [role="tab"]';

  function UI(R) {
    this.R = R;
    this.selection = null; this.layer = 'none'; this.highlightLine = null; this.hoverConflict = null;
    this.stack = []; this.open = {}; this.live = [];
    this.save = { state: 'none', at: null, msg: '' };
    this._manualSaves = new Set();
    this._celebrationQueue = []; this._celebrationActive = null;
    this.lastTick = 0; this.lastSlow = 0;
    this.buildChrome();
    const self = this;
    // 统一的点击音效：按钮、可点击的列表行与选项（标签切换等用 data-silent 自行播放更轻的音效）
    document.addEventListener('click', function (e) { const b = e.target.closest && e.target.closest(PRESS_SEL); if (b && !b.disabled && !b.dataset.silent && !b.classList.contains('switch')) snd('click'); }, true);
  }
  CM.UI = UI;
  UI.prototype.g = function () { return CM.game; };

  // ======================== 外框 ========================
  // 布局：左上「城市与时间」（日期、速度、推进）；右上「指标」与「操作」（任务、统计、设置、菜单）；
  // 左下「地图控制」与图层弹层；底部中间「建设工具」；右侧详情面板。
  UI.prototype.buildChrome = function () {
    const app = document.getElementById('app');
    const self = this;
    this.pills = {};
    const pill = function (key, label, icon, badgeCls, cls, layer) {
      const badge = h('span', { class: 'badge ' + badgeCls }, ic(icon));
      const v = h('span', { class: 'v' }, '—'), k = h('span', { class: 'k' }, label);
      const b = h('button', { class: 'pill ' + (cls || ''), 'data-tip': label + ' · 点击查看详情', onclick: function () { self.openTop(key); } }, badge, h('span', { class: 'tx' }, k, v));
      self.pills[key] = { el: b, v: v, k: k, badge: badge, layer: layer || null };
      return b;
    };
    // 日期（带一天进度环）
    const C = 2 * Math.PI * 15;
    const ring = h('span', { class: 'dayring' });
    ring.innerHTML = '<svg class="r" viewBox="0 0 36 36"><circle cx="18" cy="18" r="15" fill="none" stroke="var(--surface-3)" stroke-width="3.5"/><circle class="arc" cx="18" cy="18" r="15" fill="none" stroke="url(#dayg)" stroke-width="3.5" stroke-linecap="round" stroke-dasharray="' + C + '" stroke-dashoffset="' + C + '"/><defs><linearGradient id="dayg" x1="0" x2="1"><stop offset="0" stop-color="#2fd1bf"/><stop offset="1" stop-color="#4f8bff"/></linearGradient></defs></svg>';
    const ringIco = ic('sun'); ring.appendChild(ringIco);
    this.dayRing = { el: ring, arc: ring.querySelector('.arc'), ico: ringIco, C: C, night: null };
    const dateV = h('span', { class: 'v' }, '—'), dateK = h('span', { class: 'k' }, '');
    const datePill = h('button', { class: 'pill daypill', 'data-tip': '日期、时段与城市发展', onclick: function () { self.openTop('date'); } }, ring, h('span', { class: 'tx' }, dateK, dateV));
    this.pills.date = { el: datePill, v: dateV, k: dateK };
    this.tbtns = {};
    this.timeOptions = {};
    const timeKeys = function (b) {
      b.addEventListener('keydown', function (e) {
        if ((e.key === 'Enter' || e.key === ' ') && !e.ctrlKey && !e.metaKey && !e.altKey) { e.stopPropagation(); if (e.repeat) e.preventDefault(); }
      });
      return b;
    };
    const spd = function (id, label, n, tip, key) {
      const b = h('button', { class: 'sbtn' + (n === 0 ? ' pz' : ''), 'data-tip': tip, 'data-act': key, onclick: function () { if (n === 0) self.togglePause(); else self.setSpeed(n); } }, n === 0 ? ic('pause') : label);
      self.tbtns[id] = b; return timeKeys(b);
    };
    const jmp = function (id, label, n, tip, act) { const b = h('button', { class: 'jbtn', 'data-tip': tip, 'data-act': act, onclick: function () { self.jump(n); } }, label); self.tbtns[id] = b; return timeKeys(b); };
    const timeFold = function (kind, tip) {
      const o = self.timeOptions[kind] = { value: h('span', { class: 'gone' }) };
      o.button = h('button', { class: (kind === 'speed' ? 'sbtn' : 'jbtn') + ' time-fold', 'data-tip': tip, 'aria-label': tip, 'aria-expanded': 'false', 'aria-haspopup': 'menu', 'aria-controls': 'time-options-' + kind, onclick: function () { self.toggleTimeOptions(kind); } }, o.value, ic('chev', 14));
      o.button.addEventListener('keydown', function (e) { if (e.key === 'ArrowDown') { e.preventDefault(); e.stopPropagation(); self.toggleTimeOptions(kind, true); } });
      return timeKeys(o.button);
    };
    // 右上操作按钮
    this.hbtns = {};
    const hb = function (key, icon, tip, onclick, act) { const b = h('button', { class: 'hbtn', 'data-tip': tip, 'data-act': act || null, onclick: onclick }, ic(icon)); self.hbtns[key] = b; return b; };
    this.taskCnt = h('span', { class: 'cnt' }, '0');
    const taskBtn = hb('tasks', 'flag', '任务', function () { self.openTop('tasks'); }, 'ui.tasks');
    taskBtn.appendChild(this.taskCnt);
    this.top = h('header', { id: 'hudTop', class: 'hud hidden' },
      h('div', { class: 'cluster glass citybar' },
        datePill,
        h('div', { class: 'speed' }, spd('pause', '', 0, '暂停 / 继续', 'pause'), spd('s1', '1×', 1, '正常速度', 'speed1'), spd('s2', '3×', 2, '3 倍速', 'speed2'), timeFold('speed', '更多倍速与高峰慢放')),
        h('div', { class: 'jumps' }, jmp('month', '+1月', 1, '推进 1 个月', 'jumpMonth'), timeFold('jump', '更多时间推进选项'))),
      h('div', { class: 'spacer' }),
      h('div', { class: 'cluster glass metrics' },
        pill('money', '资金', 'coin', 'b-gold'), pill('econ', '经济增长', 'trend', 'b-violet', 'opt2'), pill('pop', '人口', 'people', 'b-blue', 'opt2', 'pop'), pill('share', '地铁分担率', 'metro', 'b-teal', 'opt3', 'cover'),
        pill('cong', '拥堵指数', 'car', 'b-orange', 'opt5', 'cong'),
        this.mFold = h('button', { class: 'pill mfold off', 'data-tip': '展开其余指标', 'aria-expanded': 'false', onclick: function () { self.toggleMetricsMore(); } }, h('span', { class: 'mf-n' }, ''), ic('chev'))),
      h('div', { class: 'cluster glass actions' },
        hb('search', 'search', '搜索车站、线路、道路、区域', function () { self.openSearch(); }, 'ui.search'),
        taskBtn,
        hb('stats', 'chart', '城市统计', function () { self.openStats(); }, 'ui.stats'),
        hb('theme', 'moon', '深色模式', function () { self.toggleTheme(); }, 'ui.theme'),
        hb('settings', 'gear', '设置', function () { self.showSettings(); }),
        hb('menu', 'menu', '菜单', function (e) { self.showMenu(e.currentTarget); })));
    // 窄屏（手机）顶栏只保留常用按钮：深浅模式与设置改在菜单中
    this.hbtns.theme.classList.add('wide-only'); this.hbtns.settings.classList.add('wide-only');
    // 左下：地图控制（v2.2 界面整理）——图层（弹出带名称与说明的图层面板）、2D / 2.5D 切换、地下视图、线路示意图，其下为缩放与指北针
    const vb = function (id, icon, tip, act, onclick, cls) { const b = h('button', { class: 'dockbtn ' + (cls || 'view'), 'data-tip': tip, 'data-act': act || null, 'data-side': 'right', onclick: onclick }, ic(icon)); self.tbtns[id] = b; return b; };
    this.layerBtn = h('button', { class: 'dockbtn layers', 'data-tip': '图层', 'data-side': 'right', 'aria-haspopup': 'dialog', 'aria-expanded': 'false', onclick: function () { self.toggleLayerPanel(); } }, ic('layers'), h('span', { class: 'lb' }, '图层'));
    this.dockBtns = {};
    this.layerPanel = h('div', { id: 'layerPanel', class: 'glass hidden', role: 'dialog', 'aria-label': '图层', inert: true });
    window.addEventListener('pointerdown', function (e) { if (!self.layerPanel.classList.contains('hidden') && !self.layerPanel.contains(e.target) && !self.layerBtn.contains(e.target)) self.toggleLayerPanel(false); }, true);
    this.legendCard = h('aside', { id: 'legendCard', class: 'hud glass hidden' });
    const R = this.R;
    this.zoomCtl = h('div', { id: 'zoomCtl' },
      h('button', { 'data-tip': '放大', 'data-act': 'cam.zoomIn', 'data-side': 'right', onclick: function () { R.zoomAt(R.w / 2, R.h / 2, 1.5); } }, ic('plus')),
      h('button', { 'data-tip': '缩小', 'data-act': 'cam.zoomOut', 'data-side': 'right', onclick: function () { R.zoomAt(R.w / 2, R.h / 2, 1 / 1.5); } }, ic('minus')),
      // 2D 与 2.5D 都平滑回到全图。
      this.compass = h('button', { class: 'compass', 'data-tip': '视角复位：回到全图', 'data-act': 'cam.fit', 'data-side': 'right', 'aria-label': '视角复位', onclick: function () { self.resetView(); },
        html: '<svg class="needle" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10.2" fill="none" stroke="currentColor" stroke-opacity=".35" stroke-width="1.4"/><path d="M12 3.6 15.1 12H8.9Z" fill="#e0483e"/><path d="M12 20.4 8.9 12h6.2Z" fill="currentColor" fill-opacity=".55"/></svg>' }));
    this.dock = h('aside', { id: 'dock', class: 'hud glass hidden' },
      this.layerBtn,
      h('div', { class: 'dock-sep' }),
      vb('view', 'view3d', '切换 2D / 2.5D', 'view.toggle', function () { self.toggleView(); }),
      vb('under', 'under', '地下视图', 'view.under', function () { self.toggleUnder(); }),
      vb('netmap', 'network', '线路示意图', 'view.netmap', function () { self.openNetMap(); }, 'plain'),
      h('div', { class: 'dock-sep' }),
      this.zoomCtl);
    // 右侧详情
    this.right = h('aside', { id: 'rightPanel', class: 'hud glass panel closed hidden', inert: true, 'aria-hidden': 'true' });
    this.rTitle = h('div', { class: 'p-title' }, '');
    this.rBadge = h('span', { class: 'badge b-blue' }, ic('info'));
    this.rBack = h('button', { class: 'iconbtn', 'data-tip': '返回', onclick: function () { self.back(); } }, ic('back'));
    this.rBody = h('div', { class: 'p-body' });
    // 输入期间推迟的页面刷新：离开输入框后补上（稍后执行，避免吞掉随后的按钮点击）
    this.rBody.addEventListener('focusout', function () {
      if (!self._pendingRefresh) return;
      setTimeout(function () {
        const a = document.activeElement;
        if (!self._pendingRefresh || (a && self.rBody.contains(a) && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA'))) return;
        self._pendingRefresh = false; self.rerenderPage();
      }, 300);
    });
    this.right.append(h('div', { class: 'p-head' }, this.rBack, this.rBadge, this.rTitle, h('button', { class: 'iconbtn', 'data-tip': '收起', 'data-key': 'Esc', onclick: function () { self.closePanel(); } }, ic('close'))), this.rBody);
    // 底部：建设工具
    const tb = function (id, icon, label, key, onclick, cls) {
      const b = h('button', { class: 'tbtn ' + (cls || ''), 'data-tip': label, 'data-act': key, onclick: onclick }, ic(icon), h('span', { class: 'lb' }, label));
      self.tbtns[id] = b; return b;
    };
    this.toolInd = h('span', { class: 'tind' });
    this.toolbar = h('nav', { id: 'toolbar', class: 'hud glass hidden' }, this.toolInd,
      tb('select', 'cursor', '选择', 'tool.select', function () { self.tools.setTool('select'); }),
      tb('station', 'station', '建站', 'tool.station', function () { self.tools.setTool('station'); }),
      tb('line', 'route', '绘线', 'tool.line', function () { self.tools.setTool('line'); }),
      tb('edit', 'pencil', '修改', 'tool.edit', function () { self.tools.setTool('edit'); }),
      tb('demolish', 'bulldozer', '拆除', 'tool.demolish', function () { self.tools.setTool('demolish'); }, 'danger'));
    // 工具条上方：建设草案栏 + 当前工具的选项条（线路、建设方式、车站规模）
    this.draftbar = h('div', { id: 'draftbar', class: 'glass hidden' });
    this.toolopts = h('div', { id: 'toolopts', class: 'glass hidden' });
    this.bstack = h('div', { id: 'buildStack', class: 'hud hidden' }, this.draftbar, this.toolopts);
    // 顶部中间信息流：暂停提示、状态横幅、消息
    this.pauseChip = h('button', { class: 'pausechip hidden', onclick: function () { self.togglePause(); } }, ic('pause'), h('span', null, '已暂停'), this.pauseKbd = h('kbd', null, CM.Keys.hint('pause') || '▶'), h('span', { class: 'muted' }, '继续'));
    CM.Keys.onChange = function () { if (self.pauseKbd) self.pauseKbd.textContent = CM.Keys.hint('pause') || '▶'; if (CM.Tutorial) CM.Tutorial.refreshKeys(); };
    this.banner = h('div', { id: 'banner' });
    this.toasts = h('div', { id: 'toasts' });
    this.feed = h('div', { id: 'feed', class: 'hidden' }, this.pauseChip, this.banner, this.toasts);
    // 城市纪事报（v2.3）：史实与经济事件改为右下角的报纸剪报，不再占地图中央；右侧面板打开时向左让开
    this.newsHost = h('div', { id: 'newsHost', class: 'hidden', role: 'log', 'aria-live': 'polite' });
    // 满意度入口（v2.3）：顶栏的满意度指标移到右下角，点击打开「乘客之声」（满意度与乘客反馈）
    pill('sat', '满意度', 'smile', 'b-green');   // 保留指标对象（指标详情页沿用），不放进顶栏
    // 地铁芯入口（v2.5）：在满意度左边，打开全部线路与车站的管理 App；角标为持续过载的项目数
    this.opsDock = h('button', { class: 'sat-dock ops-dock hidden', 'data-tip': '地铁芯：线路、车站与列车管理', 'aria-label': '地铁芯', onclick: function () { self.openOpsApp(); } },
      h('span', { class: 'sd-face' }, ic('chip', 20)), h('span', { class: 'sd-tx' }, h('small', null, '地铁芯'), h('b', { class: 'sd-v' }, '—')), h('span', { class: 'sd-dot', style: { display: 'none' } }));
    this.satDock = h('button', { class: 'sat-dock smile hidden', 'data-tip': '乘客满意度与乘客之声', onclick: function () { self.openVoicesApp(); } },
      h('span', { class: 'sd-face' }, ic('smile', 20)), h('span', { class: 'sd-tx' }, h('small', null, '满意度'), h('b', { class: 'sd-v' }, '—')), h('span', { class: 'sd-dot' }));
    this.feed.addEventListener('transitionend', function (e) {
      if (e.target === self.feed && (e.propertyName === 'left' || e.propertyName === 'max-width')) self.placeFeed();
    });
    this.tip = h('div', { id: 'tooltip' });
    this.uitip = h('div', { id: 'uitip' });
    this.screen = h('div', { id: 'screen', class: 'hidden' });
    this.statsEl = h('div', { id: 'stats', class: 'hidden' });
    this.fxLayer = h('div', { id: 'fxLayer' });
    // 折叠的指标：放在顶栏下方的下拉框里，点击「+N」展开；点指标打开详情或点空白处收起
    this.mMore = h('div', { class: 'dropdown mmore off' });
    this.mMore.addEventListener('click', function (e) { if (e.target.closest('.pill')) self.toggleMetricsMore(false); });
    window.addEventListener('pointerdown', function (e) { if (!self.mMore.classList.contains('off') && !self.mMore.contains(e.target) && !self.mFold.contains(e.target)) self.toggleMetricsMore(false); }, true);
    document.body.appendChild(this.mMore);
    this.timeOptions.speed.menu = h('div', { id: 'time-options-speed', class: 'dropdown time-options off', role: 'menu', 'aria-label': '更多倍速', 'aria-hidden': 'true' },
      spd('s3', '8×', 3, '8 倍速', 'speed3'), spd('s4', '24×', 4, '极速：24 倍速（列车与车流按 8× 表现）', 'speed4'),
      this.tbtns.peak = h('button', { class: 'sbtn peak', 'data-act': 'time.peakSlow', 'data-silent': '1', onclick: function () { self.togglePeakSlow(); } }, ic('hourglass'), h('span', null, '高峰慢放')));
    this.timeOptions.jump.menu = h('div', { id: 'time-options-jump', class: 'dropdown time-options off', role: 'menu', 'aria-label': '更多时间推进选项', 'aria-hidden': 'true' },
      jmp('quarter', '+3月', 3, '推进 3 个月（结束后显示变化）', 'jumpQuarter'), jmp('year', '+1年', 12, '推进 1 年（结束后显示变化）', 'jumpYear'));
    for (const kind of Object.keys(this.timeOptions)) {
      const o = this.timeOptions[kind]; o.menu.inert = true;
      for (const b of o.menu.children) b.setAttribute('role', b === self.tbtns.peak ? 'menuitemcheckbox' : kind === 'speed' ? 'menuitemradio' : 'menuitem');
      o.menu.addEventListener('focusout', function () { setTimeout(function () { if (!o.menu.contains(document.activeElement) && document.activeElement !== o.button) self.toggleTimeOptions(kind, false); }, 0); });
      document.body.appendChild(o.menu);
    }
    window.addEventListener('pointerdown', function (e) { for (const kind of Object.keys(self.timeOptions)) { const o = self.timeOptions[kind]; if (!o.menu.contains(e.target) && !o.button.contains(e.target)) self.toggleTimeOptions(kind, false); } }, true);
    window.addEventListener('keydown', function (e) {
      const kind = Object.keys(self.timeOptions).find(function (k) { return !self.timeOptions[k].menu.classList.contains('off'); });
      if (!kind) return;
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); self.toggleTimeOptions(kind, false, true); return; }
      const dd = self.timeOptions[kind].menu;
      if (dd.contains(document.activeElement) && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); e.stopPropagation(); if (!e.repeat) document.activeElement.click(); return; }
      if (!dd.contains(document.activeElement) || !['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) return;
      e.preventDefault(); e.stopPropagation();
      const bs = Array.from(dd.querySelectorAll('button')), i = bs.indexOf(document.activeElement);
      bs[e.key === 'Home' ? 0 : e.key === 'End' ? bs.length - 1 : (i + (e.key === 'ArrowUp' ? -1 : 1) + bs.length) % bs.length].focus();
    }, true);
    this.brDock = h('div', { class: 'br-dock' }, this.opsDock, this.satDock);
    app.append(this.top, this.dock, this.layerPanel, this.legendCard, this.right, this.toolbar, this.bstack, this.feed, this.newsHost, this.brDock, this.tip, this.uitip, this.fxLayer, this.statsEl, this.screen);
    this.initTips();
    this.initPress();
    this.renderDock();
    this.viewportProbe = h('div', { class: 'viewport-insets', 'aria-hidden': 'true' });
    app.appendChild(this.viewportProbe);
    this.layoutHud();
    window.addEventListener('resize', function () { self.layoutHud(); });
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', function () { self.layoutHud(); });
      window.visualViewport.addEventListener('scroll', function () { self.queueLayout(); });
    }
    this.right.addEventListener('focusin', function () { self.queueLayout(); });
    this.right.addEventListener('focusout', function () { self.queueLayout(); });
    // 只观察外框尺寸，不在每帧或每次文字更新时重新布局。
    if (window.ResizeObserver) {
      this.layoutObserver = new ResizeObserver(function () { self.queueLayout(); });
      for (const el of [this.top, this.toolbar, this.bstack, this.right, this.legendCard]) this.layoutObserver.observe(el);
    }
    CM.Settings.on(function (k) {
      if (k === 'immersive') self.applyImmersive();
      if (k === 'grid' || k === 'gridSnap' || k === 'peakSlow') self.renderToolbar();
      if (k === 'uiScale') { self.layoutHud(); requestAnimationFrame(function () { self.renderToolbar(); }); }
      if (k === 'theme') { self.renderThemeBtns(); if (AX.enabled()) { self.renderDock(); if (self.stack.length) self.rerenderPage(); } }
      if (k === 'colorBlind') { self._toKey = null; self.renderToolOpts(); self.renderDock(); if (self.stack.length) self.rerenderPage(); }
    });
    this.renderThemeBtns();
  };
  // 消息与提示条（暂停提示、操作提示）位置固定（v2.3 玩家反馈：以前右侧面板滑入时整条向左挪）：
  // 右侧始终按面板宽度预留、宽度限制在预留之外，面板开合都不挡面板也不挪位置
  UI.prototype.placeFeed = function () {
    const f = this.feed; if (!f) return;
    if (this.compact()) { f.style.left = ''; f.style.maxWidth = ''; }
    else {
      const z = CM.Settings.get('uiScale') || 1;
      const rw = Math.max(368 * z, this.right ? this.right.getBoundingClientRect().width : 0) + 24 * z;
      // 左侧与右侧对称（居中于窗口）；教程时让开左上的引导卡片
      const dock = document.body.classList.contains('has-coach') ? 460 * z : rw, avail = window.innerWidth - rw - dock;
      f.style.left = ((dock + avail / 2) / z) + 'px';
      f.style.maxWidth = (Math.max(280, avail - 32) / z) + 'px';
    }
    // 剪报：贴在地图右下角，右侧面板打开时让开面板（短时出现的卡片，不盖住面板内容）；
    // 满意度入口在面板下沿之下（面板最低到窗口底部 100px 处），位置固定不动
    if (this.newsHost) { const zz = CM.Settings.get('uiScale') || 1, op = this.right && !this.right.classList.contains('closed') && !this.right.classList.contains('hidden'), rx = ((op && window.innerWidth > 760 ? this.right.getBoundingClientRect().width + 24 : 14) / zz) + 'px'; this.newsHost.style.right = rx; }
    // 空间不足时收起重复的暂停提示；顶栏暂停/继续按钮仍保留，图层标题和选项不被覆盖。
    const chip = this.pauseChip, card = this.legendCard;
    if (chip) {
      chip.classList.remove('overlap');
      if (card && !card.classList.contains('hidden')) {
        const a = chip.getBoundingClientRect(), b = card.getBoundingClientRect();
        chip.classList.toggle('overlap', a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top);
      }
    }
    this.queueLayout();
  };
  UI.prototype.compact = function () {
    return matchMedia('(max-width: 760px), (max-width: 1024px) and (max-height: 520px) and (pointer: coarse)').matches;
  };
  // 软键盘和浏览器工具栏缩小的是可视视口，不一定是 innerHeight。
  UI.prototype.viewport = function () {
    const v = window.visualViewport, s = this.viewportProbe ? getComputedStyle(this.viewportProbe) : null;
    const x = v ? v.offsetLeft : 0, y = v ? v.offsetTop : 0, w = v ? v.width : innerWidth, h = v ? v.height : innerHeight;
    const pad = function (k) { return s ? parseFloat(s[k]) || 0 : 0; };
    return { x: x, y: y, w: w, h: h, left: x + pad('paddingLeft'), top: y + pad('paddingTop'), right: x + w - pad('paddingRight'), bottom: y + h - pad('paddingBottom') };
  };
  UI.prototype.queueLayout = function () {
    if (this._layoutFrame) return;
    const self = this;
    this._layoutFrame = requestAnimationFrame(function () { self._layoutFrame = 0; self.measureLayout(); if (self.layerPanelOpen()) self.placeLayerPanel(); });
  };
  UI.prototype.measureLayout = function () {
    const root = document.documentElement, v = this.viewport();
    const px = function (key, val) { const str = Math.round(val * 100) / 100 + 'px'; if (root.style.getPropertyValue(key) !== str) root.style.setProperty(key, str); };
    px('--view-top', v.y); px('--view-left', v.x); px('--view-width', v.w); px('--view-height', v.h);
    px('--view-bottom', Math.max(0, innerHeight - v.y - v.h)); px('--view-right', Math.max(0, innerWidth - v.x - v.w));
    const active = document.activeElement;
    const typing = active && this.right.contains(active) && (active.tagName === 'TEXTAREA' || (active.tagName === 'INPUT' && /^(text|search|number|email|url|tel|password)$/.test(active.type)));
    root.classList.toggle('panel-editing', !!(this.compact() && typing && (v.h < innerHeight - 120 || v.h < 420)));
    this.right.classList.toggle('short-body', this.compact() && this.rBody.clientHeight < 160);
    this.fitHud();
    const hud = this.top.getBoundingClientRect(), toolbar = this.toolbar.getBoundingClientRect();
    const visible = function (el) { return el && !el.classList.contains('hidden') && !el.classList.contains('closed') && el.getClientRects().length; };
    px('--mobile-hud-bottom', hud.bottom + 6);
    let controlsTop = toolbar.top;
    const follow = document.getElementById('followCard');
    if (document.body.classList.contains('following') && follow) controlsTop = Math.min(controlsTop, follow.getBoundingClientRect().top);
    if (!document.body.classList.contains('following') && visible(this.bstack) && (visible(this.draftbar) || visible(this.toolopts))) controlsTop = Math.min(controlsTop, this.bstack.getBoundingClientRect().top);
    px('--mobile-controls-top', controlsTop);
    px('--mobile-panel-bottom', Math.max(0, innerHeight - controlsTop + 8));
    // 底部抽屉出现后，图层图例与教程只使用上方剩余空间。
    // 使用布局位置，避免抽屉入场动画的临时位移让地图控件占用抽屉空间。
    const panelTop = this.compact() && innerHeight >= innerWidth && visible(this.right) ? this.right.offsetTop * (CM.Settings.get('uiScale') || 1) : controlsTop;
    px('--mobile-side-bottom', panelTop);
    const sidePanel = this.compact() && innerWidth > innerHeight && visible(this.right) ? this.right.getBoundingClientRect() : null;
    px('--mobile-left-width', sidePanel ? Math.max(0, sidePanel.left - v.left - 68 * (CM.Settings.get('uiScale') || 1)) : v.right - v.left);
    px('--mobile-feed-right', sidePanel ? innerWidth - sidePanel.left + 8 : innerWidth - v.right + 8);
    const coach = document.getElementById('coach');
    px('--mobile-legend-top', visible(coach) ? coach.getBoundingClientRect().bottom + 8 : hud.bottom + 6);
    let feedTop = hud.bottom + 6;
    for (const el of [document.getElementById('coach'), this.legendCard]) if (visible(el)) feedTop = Math.max(feedTop, el.getBoundingClientRect().bottom + 8);
    px('--mobile-feed-top', feedTop);
    px('--mobile-feed-height', Math.max(0, Math.min(v.h * .35, panelTop - feedTop - 8)));
    if (this.dropdown && this.dropdown._place) this.dropdown._place();
    if (this.searchEl && this.searchEl._place) this.searchEl._place();
    if (this.linePicker && this.linePicker.el._place) this.linePicker.el._place();
  };
  // 顶栏按有效宽度收起次要内容（界面放大时同样适用）
  UI.prototype.layoutHud = function () {
    this.closeTimeOptions(); this.unfoldMetrics();
    this.placeFeed();
    const w = window.innerWidth / (CM.Settings.get('uiScale') || 1);
    for (const b of [1540, 1400, 1260, 1080, 960, 820, 400, 360, 300]) this.top.classList.toggle('lt' + b, w < b);
    for (const k in this.pills) this.pills[k].el.classList.remove('squeezed');
    this.queueLayout();
  };
  // 指标栏放不下时，按优先级从低到高收起（经济 → 满意度 → 分担率 → 人口 → 拥堵）
  const METRIC_ORDER = ['money', 'econ', 'pop', 'share', 'cong'];
  UI.prototype.metricEl = function (key) {
    const p = this.pills[key]; if (!p) return null;
    if (p.el.dataset.fold && this.mMore.classList.contains('off')) return this.mFold;
    return p.el;
  };
  UI.prototype.fitHud = function () {
    const m = this.top.querySelector('.cluster.metrics'); if (!m || !m.clientWidth) return;
    const over = function () { return m.scrollWidth > m.clientWidth + 1; };
    // CSS 为窄屏隐藏的指标也进入「+N」，不能只收起溢出的可见指标。
    for (const k of ['econ', 'share', 'pop', 'cong']) {
      const el = this.pills[k].el;
      if (el.parentNode === m && !el.classList.contains('gone') && getComputedStyle(el).display === 'none') { el.dataset.fold = '1'; this.mMore.appendChild(el); }
    }
    if (over() || this.mMore.children.length) this.mFold.classList.remove('off');
    for (const k of ['econ', 'share', 'pop', 'cong']) {
      if (!over()) break;
      const el = this.pills[k].el; if (el.parentNode !== m || getComputedStyle(el).display === 'none') continue;
      el.dataset.fold = '1'; this.mMore.appendChild(el);
    }
    const folded = METRIC_ORDER.filter(function (k) { return this.pills[k].el.dataset.fold; }, this);
    for (const k of folded) this.mMore.appendChild(this.pills[k].el);
    const n = folded.filter(function (k) { return !this.pills[k].el.classList.contains('gone'); }, this).length;
    this.mFold.querySelector('.mf-n').textContent = '+' + n;
    this.mFold.classList.toggle('off', !n);
  };
  // 指标按钮（教程指引用）：被折叠进「+N」时指向折叠按钮或已展开的下拉框中的指标
  UI.prototype.metricEl = function (key) {
    const p = this.pills[key]; if (!p) return null;
    if (p.el.dataset.fold && this.mMore.classList.contains('off')) return this.mFold;
    return p.el;
  };
  UI.prototype.showHUD = function (on) {
    for (const el of [this.top, this.dock, this.right, this.toolbar, this.zoomCtl, this.feed, this.bstack, this.newsHost, this.satDock, this.opsDock]) {
      const inactive = !on || (el === this.right && el.classList.contains('closed'));
      if (inactive && el.contains(document.activeElement)) document.activeElement.blur();
      el.classList.toggle('hidden', !on);
      el.inert = inactive;
      el.setAttribute('aria-hidden', inactive ? 'true' : 'false');
    }
    if (!on) {
      if (this.voApp) this.voApp.close(null, true);   // 「地铁圈」App 随游戏界面一起收起
      if (this.opsApp) this.opsApp.close(null, true);
      if (this.hideOpsPop) this.hideOpsPop();
      this.closeTimeOptions();
      this.toggleLayerPanel(false);
      this.toggleMetricsMore(false);
      this.draftbar.classList.add('hidden'); this.legendCard.classList.add('hidden'); this.statsEl.classList.add('hidden');
      if (this.legendCard.contains(document.activeElement)) document.activeElement.blur();
      this.legendCard.inert = true; this.legendCard.setAttribute('aria-hidden', 'true');
    }
    else { this.renderDock(); const self = this; requestAnimationFrame(function () { self.renderToolbar(); }); }
    this.applyImmersive();
  };
  UI.prototype.toggleImmersive = function (on) { CM.Settings.set('immersive', on == null ? !CM.Settings.get('immersive') : !!on); };
  UI.prototype.applyImmersive = function () {
    const self = this, on = !!CM.Settings.get('immersive') && !!this.g() && !this.top.classList.contains('hidden'), was = document.body.classList.contains('cinema');
    if (!this.immExit) {
      this.immExit = h('button', { id: 'immExit', 'aria-label': '显示界面', onclick: function () { self.toggleImmersive(false); } }, ic('eye', 16), h('span', null, '显示界面'));
      this.immHintEl = h('div', { id: 'immHint', role: 'status' });
      document.getElementById('app').append(this.immExit, this.immHintEl);
    }
    document.body.classList.toggle('cinema', on);
    this.immExit.inert = !on;
    for (const el of [this.top, this.dock, this.right, this.toolbar, this.zoomCtl, this.feed, this.bstack, this.newsHost, this.satDock, this.legendCard, document.getElementById('coach')]) if (el && (on || was)) {
      const inactive = on || el.classList.contains('hidden') || (el === this.right && el.classList.contains('closed'));
      if (inactive && el.contains(document.activeElement)) document.activeElement.blur();
      el.inert = inactive; el.setAttribute('aria-hidden', inactive ? 'true' : 'false');
    }
    if (on === was) return;
    clearTimeout(this._immT);
    if (on) {
      this.setTooltip(null); this.toggleLayerPanel(false); this.closeTimeOptions(); this.toggleMetricsMore(false); this.closeMenu(); this.closeSearch();
      const k = CM.Keys.hint('ui.hideUI');
      this.immHintEl.textContent = '沉浸模式' + (k ? ' · 按 ' + k + ' 显示界面' : ' · 点右上角显示界面');
      if (CM.I18n) CM.I18n.localize(this.immHintEl);
      this.immHintEl.classList.add('on');
      this._immT = setTimeout(function () { self.immHintEl.classList.remove('on'); }, 2600);
    } else { this.immHintEl.classList.remove('on'); this.queueLayout(); }
  };
  // 界面提示：带 data-tip 的元素悬停时显示（可附快捷键），替代浏览器默认 title
  UI.prototype.initTips = function () {
    const tipEl = this.uitip;
    let cur = null, timer = null;
    const show = function (el) {
      // data-act：提示中的按键取自当前键位（设置中可自定义），优先于固定的 data-key
      const act = el.getAttribute('data-act');
      let key = el.getAttribute('data-key');
      if (act && CM.Keys) { const hk = CM.Keys.hint(act), pre = el.getAttribute('data-key-pre'); key = pre ? (hk ? pre + ' / ' + hk : pre) : hk; }
      tipEl.innerHTML = '';
      // 注意：原生 append(null) 会把 null 写成文字，没有快捷键时不能传 null
      tipEl.appendChild(h('span', null, el.getAttribute('data-tip')));
      if (key) tipEl.appendChild(h('kbd', null, key));
      tipEl.className = 'on';
      const r = el.getBoundingClientRect(), w = tipEl.offsetWidth, hh = tipEl.offsetHeight, side = el.getAttribute('data-side');
      let x, y;
      if (side === 'right') { x = r.right + 10; y = r.top + r.height / 2 - hh / 2; tipEl.classList.add('s-right'); }
      else if (side === 'left') { x = r.left - w - 10; y = r.top + r.height / 2 - hh / 2; tipEl.classList.add('s-left'); }
      else {
        x = r.left + r.width / 2 - w / 2;
        const below = r.top < window.innerHeight / 2;
        y = below ? r.bottom + 9 : r.top - hh - 9;
        tipEl.classList.add(below ? 's-below' : 's-above');
      }
      tipEl.style.left = U.clamp(x, 6, window.innerWidth - w - 6) + 'px';
      tipEl.style.top = U.clamp(y, 6, window.innerHeight - hh - 6) + 'px';
    };
    const hide = function () { clearTimeout(timer); cur = null; tipEl.className = ''; };
    document.addEventListener('pointerover', function (e) {
      const el = e.target.closest && e.target.closest('[data-tip]');
      if (el === cur) return;
      hide();
      if (!el || e.pointerType === 'touch') return;
      cur = el;
      timer = setTimeout(function () { if (cur === el && document.body.contains(el)) show(el); }, 380);
    });
    document.addEventListener('pointerdown', hide, true);
    document.addEventListener('pointerout', function (e) {
      if (!cur || (e.relatedTarget && cur.contains(e.relatedTarget))) return;
      // 指针下的子元素被刷新替换（数字、文字更新）时也会触发 pointerout：指针仍在原元素范围内就不隐藏（v2.3，修复提示闪烁）
      if (!e.relatedTarget && document.body.contains(cur)) { const r = cur.getBoundingClientRect(); if (e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom) return; }
      hide();
    });
    document.addEventListener('keydown', hide, true);
    document.addEventListener('scroll', hide, true);
    window.addEventListener('resize', hide);
    window.addEventListener('blur', hide);
  };
  // 按压反馈：所有可点击元素统一的涟漪（放在按钮自身圆角内的裁切层里，不影响角标等溢出内容）
  UI.prototype.initPress = function () {
    document.addEventListener('pointerdown', function (e) {
      if (CM.Settings.reducedMotion() || e.button > 0) return;
      const b = e.target.closest && e.target.closest(PRESS_SEL);
      if (!b || b.disabled || b.classList.contains('switch') || b.hasAttribute('data-noripple')) return;
      const r = b.getBoundingClientRect(); if (r.width < 10 || r.height < 10) return;
      const d = Math.max(r.width, r.height) * 1.6;
      let wrap = null;
      for (const c of b.children) if (c.classList.contains('rip-wrap')) { wrap = c; break; }
      if (!wrap) { wrap = h('span', { class: 'rip-wrap', 'aria-hidden': 'true' }); b.appendChild(wrap); }
      const rp = h('span', { class: 'ripple', style: { width: d + 'px', height: d + 'px', left: (e.clientX - r.left - d / 2) + 'px', top: (e.clientY - r.top - d / 2) + 'px' } });
      wrap.appendChild(rp);
      setTimeout(function () { rp.remove(); }, 600);
    }, true);
    // 光标柔光（v2.1）：悬停的按钮 / 卡片记下光标位置，CSS 用它画一抹跟随的柔光；每帧最多更新一次
    const GLOW_SEL = '.btn, .start-btn, .mode-card, .map-mode, .msel-item';
    let glowEl = null, gx = 0, gy = 0, glowRaf = 0;
    document.addEventListener('pointermove', function (e) {
      if (e.pointerType === 'touch' || CM.Settings.reducedMotion()) return;
      const b = e.target.closest && e.target.closest(GLOW_SEL);
      if (!b) { glowEl = null; return; }
      glowEl = b; gx = e.clientX; gy = e.clientY;
      if (glowRaf) return;
      glowRaf = requestAnimationFrame(function () {
        glowRaf = 0; if (!glowEl) return;
        const r = glowEl.getBoundingClientRect();
        glowEl.style.setProperty('--mx', (gx - r.left).toFixed(0) + 'px'); glowEl.style.setProperty('--my', (gy - r.top).toFixed(0) + 'px');
      });
    }, { passive: true });
  };
  UI.prototype.blocking = function () {
    return !this.screen.classList.contains('hidden') || !this.statsEl.classList.contains('hidden') || !!this.voApp || !!this.opsApp || !!(CM.NetMap && CM.NetMap.isOpen()) || !!(this.g() && this.g().jumping);
  };
  // App 是模态窗口；Tab 不进入背景 HUD，内层对话框先处理键盘。
  UI.prototype.appKey = function (e, app, close) {
    if (e.key !== 'Tab' && e.key !== 'Escape') return;
    if (!this.screen.classList.contains('hidden') || Array.from(document.querySelectorAll('.qpop,.dropdown')).some(function (p) { return !app.contains(p) && p.getClientRects().length; })) return;
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); return; }
    const items = Array.from(app.querySelectorAll('button:not([disabled]),input:not([disabled]),select:not([disabled]),a[href],[tabindex="0"]')).filter(function (el) { return el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden' && !el.closest('[inert]'); });
    const active = document.activeElement, first = items[0], last = items[items.length - 1];
    if (!first) { e.preventDefault(); app.focus(); }
    else if (e.shiftKey && (active === first || active === app || !app.contains(active))) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && (active === last || !app.contains(active))) { e.preventDefault(); first.focus(); }
  };
  UI.prototype.celebrationBlocked = function () {
    return this.blocking() || (this.compact() && (!this.right.classList.contains('closed') || !this.legendCard.classList.contains('hidden') || this.layerPanelOpen() || !!this.searchEl || !!this.dropdown || !!this.linePicker || !!document.getElementById('coach') || !!document.getElementById('followCard') || !!(this.g() && this.g().draft)));
  };

  // ======================== 游戏接入 ========================
  UI.prototype.attachGame = function (g) {
    const self = this;
    this.toggleLayerPanel(false);
    this._tot = null; this._totCity = null; this._popShown = null; this._funds = null; this._congT = 0;
    for (const pill of [this.pills.pop, this.pills.money]) pill.v._tw = null;
    this.clearCelebrations();
    this.selection = null; this.stack = []; this.closePanel(true);
    this.layer = 'none'; this.R.layer = 'none'; this.renderDock();
    if (this.opsApp) this.opsApp.close(null, true);
    if (this.hideOpsPop) this.hideOpsPop();
    g.on('toast', function (t) {
      const go = function (tab) { return function () { self.taskTab = tab; self.openPage('tasks', tab, { root: true }); }; };
      if (t.ppp && t.kind === 'good') snd('contract');
      self.toast(t.text, t.kind, t.offer ? { label: '查看挑战', fn: go('active') } : (t.ppp ? { label: '查看合同', fn: go('ppp') } : (t.fleet ? { label: '列车运营', fn: function () { self.openObj('line', t.fleet, 'ops'); } } : (t.models ? { label: '查看车型', fn: function () { self.openPage('fleet', null, { root: true }); } } : undefined))));
    });
    // 车队变化（v2.5）：正在看的线路页与车队页随之刷新
    g.on('fleet', function () { const top = self.stack[self.stack.length - 1]; if (top && (top.kind === 'line' || top.kind === 'fleet')) self.rerenderPage(); else if (self.opsApp) self.opsApp.refresh(); });
    g.on('draft', function () { self.lastDraftChange = performance.now(); self.tools.syncDraft(); self.syncSelection(); self.renderDraftbar(); self.renderToolOpts(); self.refreshObjectPage(); if (self.opsApp) self.opsApp.refresh(); });
    g.on('draftLive', function () { self.lastDraftChange = performance.now(); });
    g.on('prediction', function () { self.refreshPrediction(); self.renderDraftbar(); });
    g.on('network', function () { self.markUnsaved(); self.rerenderPage(); });
    g.on('tasksUpdated', function () { self.markUnsaved(); if (self.stack.length) self.rerenderPage(); });
    g.on('trafficImpact', function () { self.markUnsaved(); if (self.stack.length) self.rerenderPage(); if (CM.Tutorial && CM.Tutorial.onImpact && CM.Tutorial.onImpact()) return; self.toast('本次建设的效果报告已生成', 'info', { label: '查看报告', fn: function () { self.openPage('impact', null, { root: true }); } }); });
    g.on('finance', function () { self.markUnsaved(); self.rerenderPage(); self.scheduleAutosave(); });
    g.on('month', function () { self.markUnsaved(); if (!g.jumping) { self.rerenderPage(); self.scheduleAutosave(); if (g.speed > 0) snd('month'); } });   // 跳月期间页面被推进卡片盖住，结束时统一刷新（v2.6）
    g.on('month', function () { if (CM.OpsAlerts) { try { CM.OpsAlerts.record(g); } catch (e) { console.error(e); } } });
    g.on('network', function () { self.updateOpsDock(); });
    g.on('autosave', function () { self.scheduleAutosave(); });
    g.on('failed', function (f) { snd('fail'); if (!g.jumping) self.showFailure(f); });
    g.on('jump', function () { snd('whoosh'); self.showJump(); });
    g.on('jumpProgress', function (p) { self.updateJump(p); });
    g.on('jumpDone', function (r) { snd('chime'); self.rerenderPage(); self.showJumpResult(r); self.scheduleAutosave(); if (r.failed) self.showFailure(r.failed); });
    g.on('speed', function () { self.renderToolbar(); });
    // 里程碑：消息提示；重大节点弹出庆祝横幅（跳月 / 跳年期间只记录）
    // 乘客之声：每月结算与建设效果更新后重新生成反馈（结果按月份与线网缓存）
    const voGen = function () { if (CM.Voices && !g.jumping && CM.game === g) { try { CM.Voices.generate(g); } catch (e) { console.error(e); } if (self.voApp) self.voApp.refresh(); } };
    g.on('month', voGen); g.on('trafficImpact', voGen); g.on('jumpDone', voGen);
    g.on('milestone', function (r) {
      if (g.jumping) return;
      const c = CM.Milestones.CAT[r.cat] || {};
      if (r.big) { snd('fanfare'); self.celebrate('里程碑：' + r.title, r.desc || '', c.color); }
      else self.toast('里程碑：' + r.title, 'good');
    });
    g.on('event', function (e) {
      if (e.tag === '任务' && e.title.indexOf('任务完成') === 0) { snd('fanfare'); if (!g.jumping) self.celebrate(e.title.replace(/^任务完成[:：]?\s*/, '任务完成：'), e.desc || '', '#f0a72b'); }
      else if (e.title.indexOf('新区域开放') === 0) {
        snd('unlock');
        const name = e.title.replace('新区域开放：', '');
        const rg = g.city.regions.find(function (r) { return r.name === name; });
        if (rg && rg.cx != null && !g.jumping) self.R.addFx('region', rg.cx, rg.cy, { name: name });
      }
    });
    this.save = { state: 'none', at: null, msg: '' };
    this.lastAuto = performance.now();
    this.showHUD(true);
    this.renderToolbar();
    this.renderDraftbar();
    this.tick(0, true);
  };

  // ======================== 每帧 ========================
  UI.prototype.tick = function (dt, force) {
    const g = this.g(); if (!g) return;
    if (CM.Quick) CM.Quick.tick();
    if (this._celebrationActive || this._celebrationQueue.length) {
      if (this.celebrationBlocked()) {
        const active = this._celebrationActive;
        if (active) {
          clearTimeout(this._celebrationTimer); clearTimeout(this._celebrationExitTimer);
          if (!active.closing) this._celebrationQueue.unshift(active.item);
          active.box.remove(); this._celebrationActive = null;
        }
      } else this.showNextCelebration();
    }
    const now = performance.now();
    if (force || now - this.lastTick > 250) {
      this.lastTick = now;
      this.updateTop();
      if (this.pageDailyStale && !g.model.dailyStale && this.stack.length) {
        const a = document.activeElement;
        if (a && this.rBody.contains(a) && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA')) this._pendingRefresh = true;
        else this.rerenderPage();
      }
      for (const f of this.live) { try { f(); } catch (e) { /* 页面已变化 */ } }
      if (CM.Stats && CM.Stats.isOpen()) CM.Stats.tick();
    }
    if (force || now - this.lastSlow > 1000) {
      this.lastSlow = now;
      this.updateBanner();
      this.renderDraftbar();
      if (now - this.lastAuto > 5 * 60 * 1000 && this.save.state !== 'saving' && !this.isSaved() && CM.Settings.get('autosave')) this.doAutosave();
    }
    const d = g.draft;
    if (d && (d.pred.state === 'idle' || d.pred.state === 'stale') && !this.tools.drag && this.lastDraftChange && now - this.lastDraftChange > 1200 && d.autoVer !== d.ver && !g.jumping && !g.pending) {
      d.autoVer = d.ver;
      const ev = g.draftEval();
      if (ev && ev.changed) g.requestPrediction();
    }
  };
  UI.prototype.drawOverlay = function (ctx, R) { this.tools.drawOverlay(ctx, R); if (this.tools.tagRect || this.tools.tagPrev) this.placeTip(this.tools.tagRect); if (CM.Corp) CM.Corp.drawOverlay(ctx, R, this); };

  // 只在内容变化时写入（v2.3）：每帧重写会替换指针下的子节点，悬停提示与样式随之闪烁
  const setH = function (el, html) { if (el._h !== html) { el._h = html; el.innerHTML = html; } };
  const setT = function (el, text) { if (el._t !== text) { el._t = text; el.textContent = text; } };
  UI.prototype.updateTop = function () {
    const g = this.g(), c = this.pills, d = g.model.daily || {};
    const W = g.model.weights(g.clock.minute);
    const per = CFG.periods[g.model.hourPeriod[Math.floor(g.clock.minute / 60) % 24]];
    setH(c.date.v, U.esc(g.clock.y + '年' + g.clock.m + '月' + g.clock.d + '日') + ' <small>' + U.fmtClock(g.clock.minute) + '</small>');
    const slowing = g.peakSlowNow();
    setT(c.date.k, UI.weekdayName(g.clock) + ' · ' + per.name + (slowing ? ' · 慢放中' : ''));
    if (slowing !== this._peakOn) { this._peakOn = slowing; this.tbtns.peak.classList.toggle('active', slowing); }
    c.date.el.setAttribute('data-tip', g.stageName() + ' · 点击查看日期、时段与城市发展');
    const rg = this.dayRing, frac = (g.clock.minute % 1440) / 1440;
    rg.arc.setAttribute('stroke-dashoffset', String(rg.C * (1 - frac)));
    const night = g.clock.minute < 360 || g.clock.minute >= 1140;
    if (night !== rg.night) { rg.night = night; rg.ico.innerHTML = night ? I.moon : I.sun; rg.el.classList.toggle('night', night); }
    if (g.econ.isFree()) setH(c.money.v, '∞ <small>自由建造</small>');
    else {
      const f = g.econ.funds;
      if (this._funds != null && Math.abs(f - this._funds) >= 300) this.moneyFloat(f - this._funds);
      this.tweenNum(c.money.v, this._funds == null ? f : this._funds, f, function (x) { return U.fmtMoney(x); });
      this._funds = f;
      c.money.v.className = 'v' + (f < 0 ? ' bad' : '');
    }
    const tot = this._tot && this._totCity === g.city && this._totVer === g.city.version ? this._tot : (this._tot = g.city.totals(), this._totCity = g.city, this._totVer = g.city.version, this._tot);
    this.tweenNum(c.pop.v, this._popShown == null ? tot.pop : this._popShown, tot.pop, U.fmtPeople);
    this._popShown = tot.pop;
    const hist = g.history, prev = hist.length > 1 ? hist[hist.length - 2] : null;
    const trend = function (cur, old, betterUp, pct) {
      if (old == null || !isFinite(old)) return '';
      const dlt = cur - old;
      if (Math.abs(dlt) < (pct ? 0.0005 : 0.005)) return '';
      return '<span class="trend ' + ((betterUp ? dlt > 0 : dlt < 0) ? 'good' : 'bad') + '">' + (dlt > 0 ? '▲' : '▼') + '</span>';
    };
    setH(c.share.v, U.fmtPct(d.metroShare || 0) + ' ' + trend(d.metroShare || 0, prev && prev.share, true, true));
    if (!this._congT || performance.now() - this._congT > 900) { this._congT = performance.now(); this._cong = g.model.cityCongAt(W); }
    const cg = this._cong,congLevel=CM.Model.congestionLevel(cg);
    setH(c.cong.v, cg.toFixed(2) + ' <small>' + CM.Model.congestionNames[congLevel] + '</small>');
    c.cong.badge.className = 'badge ' + ['b-green', 'b-gold', 'b-orange', 'b-red'][congLevel];
    // 城市经济：最近一年的实际增速（尚无完整年度时为本年预测）与经济环境；教程等未启用的地图不显示
    const hasEco = !!(g.macro && CM.Macro);
    c.econ.el.classList.toggle('gone', !hasEco);
    if (hasEco && (!this._ecoT || performance.now() - this._ecoT > 1500 || this._ecoRev !== g.macro.rec.length)) {
      this._ecoT = performance.now(); this._ecoRev = g.macro.rec.length;
      const mv = CM.Macro.view(g), L = mv.last, gr = L && L.growth != null ? L.growth : mv.fc.growth;
      c.econ.v.innerHTML = U.esc(gr == null ? '—' : UI.pctS(gr)) + ' <small>' + U.esc(mv.env.label) + '</small>';
      c.econ.k.textContent = L && L.growth != null ? L.y + ' 年实际增长' : '本年预测增长';
      c.econ.badge.className = 'badge ' + (mv.env.cls === 'good' ? 'b-green' : (mv.env.cls === 'bad' ? 'b-red' : (mv.env.cls === 'warn' ? 'b-orange' : 'b-violet')));
      c.econ.el.setAttribute('data-tip', '城市经济：' + mv.env.label + ' · ' + (L ? L.y + ' 年 GDP ' + UI.fmtBig(L.nom) : '本年 GDP 预测 ' + UI.fmtBig(mv.fc.nom)) + ' · 点击查看');
    }
    const sat = g.econ.sat;
    setH(c.sat.v, Math.round(sat) + ' ' + trend(sat, prev && prev.sat, true));
    const sk = sat >= 60 ? 'smile' : (sat >= 40 ? 'meh' : 'frown');
    if (c.sat.ico !== sk) { c.sat.ico = sk; c.sat.badge.className = 'badge ' + (sk === 'smile' ? 'b-green' : (sk === 'meh' ? 'b-orange' : 'b-red')); c.sat.badge.innerHTML = ''; c.sat.badge.appendChild(ic(sk)); }
    if (CM.Voices && this.updateSatDock) this.updateSatDock(g);
    if (this.tickOps) this.tickOps(g);
    const n = g.tasks.active.length;
    this.taskCnt.textContent = n; this.taskCnt.style.display = n ? '' : 'none';
    const s = this.save;
    this.hbtns.menu.classList.toggle('warn-dot', s.state === 'error');
    // 存档状态：保存中在菜单按钮上显示脉动小点；悬停提示注明是否已保存
    this.hbtns.menu.classList.toggle('saving-dot', s.state === 'saving');
    const mt = '菜单 · ' + this.saveStatusText();
    if (mt !== this._menuTip) { this._menuTip = mt; this.hbtns.menu.setAttribute('data-tip', mt); }
    this.pauseChip.classList.toggle('hidden', !(g.speed === 0 && !g.jumping && this.screen.classList.contains('hidden')));
    this.fitHud();
    const top = this.stack[this.stack.length - 1];
    for (const k in c) {
      const kind = k === 'money' || k === 'econ' ? 'finance' : (k === 'date' ? 'date' : 'metric');
      let on = !!top && top.kind === kind && (kind !== 'metric' || top.id === k);
      if (on && kind === 'finance') on = (top.id === 'econ') === (k === 'econ');
      c[k].el.classList.toggle('on', on);
    }
    this.hbtns.tasks.classList.toggle('on', !!top && top.kind === 'tasks');
  };
  function fmtHM(t) { if (!t) return ''; const d = new Date(t); return U.pad2(d.getHours()) + ':' + U.pad2(d.getMinutes()); }
  // 存档状态：注明已保存的是哪个游戏时刻，避免把旧快照当作当前进度
  UI.prototype.saveStatusText = function () {
    const s = this.save;
    const at = s.clock ? s.clock.y + '年' + s.clock.m + '月' + s.clock.d + '日 ' + U.fmtClock(s.clock.minute) : '';
    if (s.state === 'saving') return '保存中…';
    if (s.state === 'error') return '保存失败';
    if (this.isSaved()) return '已保存（游戏时间 ' + at + '）';
    if (s.clock) return '有未保存的进度（上次保存：' + at + '）';
    return '尚未保存';
  };
  // 数字滚动：数值变化时在约 0.45 秒内平滑过渡
  UI.prototype.tweenNum = function (el, from, to, fmt) {
    if (el._tw && el._tw.to === to) return;
    if (from === to || CM.Settings.reducedMotion() || Math.abs(to - from) < Math.abs(to) * 0.0005) { el._tw = { to: to }; el.textContent = fmt(to); return; }
    const t0 = performance.now(), tw = el._tw = { to: to };
    const step = function (t) {
      if (el._tw !== tw) return;
      const k = Math.min(1, (t - t0) / 450), e = 1 - Math.pow(1 - k, 3);
      el.textContent = fmt(from + (to - from) * e);
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  };
  // 资金变化飘字（拨款、建设扣费等较大变化）
  UI.prototype.moneyFloat = function (d) {
    const g = this.g();
    if (!g || g.jumping || CM.Settings.reducedMotion()) return;
    const r = this.pills.money.el.getBoundingClientRect();
    const el = h('div', { class: 'floater ' + (d > 0 ? 'good' : 'bad'), style: { left: (r.left + r.width / 2) + 'px', top: (r.bottom - 6) + 'px' } }, (d > 0 ? '+' : '−') + U.fmtMoney(Math.abs(d)));
    this.fxLayer.appendChild(el);
    this.pills.money.el.classList.remove('flash-good', 'flash-bad'); void this.pills.money.el.offsetWidth;
    this.pills.money.el.classList.add(d > 0 ? 'flash-good' : 'flash-bad');
    if (d > 0) snd('coin');
    setTimeout(function () { el.remove(); }, 1700);
  };
  // 同时触发的开通和任务依次展示，退出动画结束后再显示下一条。
  UI.prototype.clearCelebrations = function () {
    clearTimeout(this._celebrationTimer); clearTimeout(this._celebrationExitTimer);
    if (this._celebrationActive) this._celebrationActive.box.remove();
    this._celebrationActive = null; this._celebrationQueue.length = 0;
  };
  UI.prototype.celebrate = function (title, sub, color) {
    const item = { title: String(title || ''), sub: String(sub || ''), color: color };
    const same = function (o) { return o.title === item.title && o.sub === item.sub && o.color === item.color; };
    if ((this._celebrationActive && same(this._celebrationActive.item)) || this._celebrationQueue.some(same)) return;
    this._celebrationQueue.push(item);
    this.showNextCelebration();
    const count = this._celebrationActive && this._celebrationActive.box.querySelector('.celebrate-count');
    if (count) { count.hidden = !this._celebrationQueue.length; count.textContent = '另有 ' + this._celebrationQueue.length + ' 条'; }
  };
  UI.prototype.dismissCelebration = function () {
    const self = this, active = this._celebrationActive;
    if (!active || active.closing) return;
    clearTimeout(this._celebrationTimer); active.closing = true; active.box.classList.add('out');
    this._celebrationExitTimer = setTimeout(function () {
      if (self._celebrationActive !== active) return;
      active.box.remove(); self._celebrationActive = null; self.showNextCelebration();
    }, CM.Settings.reducedMotion() ? 0 : 350);
  };
  UI.prototype.showNextCelebration = function () {
    if (this._celebrationActive || !this._celebrationQueue.length || this.celebrationBlocked()) return;
    const self = this, item = this._celebrationQueue.shift(), title = item.title, sub = item.sub, color = item.color;
    const rm = CM.Settings.reducedMotion() || item.shown;
    const count = h('span', { class: 'celebrate-count', hidden: !this._celebrationQueue.length }, '另有 ' + this._celebrationQueue.length + ' 条');
    const box = h('div', { class: 'celebrate' }, h('div', { class: 'ribbon', style: { '--c': color || 'var(--accent)' } },
      h('span', { class: 'medal', 'aria-hidden': 'true' }, ic('trophy')),
      h('div', { class: 'celebrate-copy', role: 'status', 'aria-live': 'polite', 'aria-atomic': 'true' }, h('div', { class: 't' }, title), sub ? h('div', { class: 's' }, sub) : null, count),
      h('button', { class: 'hbtn celebrate-close', 'aria-label': '关闭当前提示', title: '关闭当前提示，继续下一条', onclick: function () { self.dismissCelebration(); } }, ic('close'))));
    this._celebrationActive = { box: box, item: item, closing: false };
    if (!rm) {
      const cols = [color || '#2f6fb6', '#f0a72b', '#16a085', '#e84393', '#6c5ce7', '#e2382e'];
      for (let k = 0; k < 46; k++) {
        const p = h('i', { class: 'confetti' });
        p.style.left = (50 + (Math.random() - 0.5) * 70) + '%';
        p.style.background = cols[k % cols.length];
        p.style.setProperty('--dx', ((Math.random() - 0.5) * 260).toFixed(0) + 'px');
        p.style.setProperty('--rot', (Math.random() * 720 - 360).toFixed(0) + 'deg');
        p.style.animationDelay = (Math.random() * 0.35).toFixed(2) + 's';
        p.style.animationDuration = (1.6 + Math.random() * 1.1).toFixed(2) + 's';
        box.appendChild(p);
      }
    }
    this.fxLayer.appendChild(box);
    if (!item.shown) snd('celebrate');
    item.shown = true;
    this._celebrationTimer = setTimeout(function () { self.dismissCelebration(); }, Math.min(7000, Math.max(3800, (title.length + sub.length) * 70)));
  };

  UI.prototype.clearHist = function () {
    this._histQ = []; this._phaseQ = [];
    if (this.histHost) this.histHost.innerHTML = '';
    if (this.newsHost) this.newsHost.innerHTML = '';
  };
  UI.prototype.flushHist = function () {
    const g = this.g(); if (!g || g.jumping || this.blocking() || this.celebrationBlocked() || !this._histQ) return;
    if (this._phaseQ.length) { const er = this._phaseQ[this._phaseQ.length - 1]; this._phaseQ.length = 0; this.showPhaseBanner(er); }
    if (!this._histQ.length) return;
    // 跳月 / 跳年后一次到来的多条事件合成一份「本期要闻」
    if (this._histQ.length > 2) { this.showHistDigest(this._histQ.splice(0)); return; }
    while (this._histQ.length && this.newsHost.querySelectorAll('.news-card').length < 2) this.showHistCard(this._histQ.shift());
  };
  // 卡片的停留、悬停暂停与退出
  UI.prototype.histLife = function (box, ms) {
    const self = this; let left = ms, t0 = performance.now(), timer = null;
    const close = function () { if (box.classList.contains('out')) return; clearTimeout(timer); box.classList.add('out'); setTimeout(function () { box.remove(); self.flushHist(); }, CM.Settings.reducedMotion() ? 0 : 380); };
    const run = function () { t0 = performance.now(); timer = setTimeout(close, left); box.style.setProperty('--life-play', 'running'); };
    box.addEventListener('pointerenter', function () { clearTimeout(timer); left -= performance.now() - t0; box.style.setProperty('--life-play', 'paused'); });
    box.addEventListener('pointerleave', run);
    box.style.setProperty('--life', ms + 'ms');
    run();
    return close;
  };
  UI.prototype.showPhaseBanner = function (er) {
    const self = this, E = CM.Eras; if (!E || !er || !er.era) return;
    const L = E.list(), k = L.indexOf(er.era), e = er.era, to = E.endOf(k);
    for (const old of this.histHost.querySelectorAll('.phase-banner')) old.remove();
    // 展望：背景中「估算 / 模拟」的第一句；上一阶段的结果：人口、岗位、新开发用地与地铁
    const en = CM.I18n && CM.I18n.get() === 'en';
    const outlook = en ? (CM.I18n.text(String(e.summary || '')).split(/Estimated: |Simulated: |Fictional: /)[1] || '').split(/\.\s/)[0].replace(/\.$/, '')
      : (String(e.summary || '').split(/估算：|模拟：|虚构：/)[1] || '').split('。')[0];
    let prev = null;
    if (er.prev && er.prev.start && er.prev.end) {
      const a = er.prev.start, b = er.prev.end, pe = E.byId(er.prev.id), pc = function (x, y) { return x > 0 ? U.fmtSigned(Math.round((y / x - 1) * 100), 0) + '%' : '—'; };
      const bits = ['人口 ' + pc(a.pop, b.pop), '岗位 ' + pc(a.jobs, b.jobs)];
      if (a.dev != null && b.dev != null) bits.push('新开发用地 ' + U.fmtSigned(Math.round((b.dev - a.dev) * CFG.CELL_M * CFG.CELL_M / 1e5) / 10, 1) + ' km²');
      bits.push(b.km > 0 ? '地铁 ' + U.fmtNum(b.km, 0) + ' km' : '尚无地铁');
      prev = '「' + (pe ? pe.name : '上一阶段') + '」' + bits.join(' · ');
    }
    let close = null;
    const box = h('div', { class: 'phase-banner', style: { '--ec': UI.ERA_COLORS[k % UI.ERA_COLORS.length] }, role: 'status' },
      h('span', { class: 'pb-line' }),
      h('div', { class: 'pb-num' }, h('b', null, String(k + 1)), h('small', null, '/ ' + L.length)),
      h('div', { class: 'pb-body' },
        h('div', { class: 'pb-kick' }, h('span', null, '号外 · 新的发展阶段 · ' + e.from + (to ? '–' + to : ' 年起')), h('span', { class: 'pb-tag' }, e.tag)),
        h('div', { class: 'pb-title' }, e.name),
        outlook ? h('div', { class: 'pb-sub' }, en ? outlook.charAt(0).toUpperCase() + outlook.slice(1) + '.' : outlook + '。') : null,
        prev ? h('div', { class: 'pb-prev' }, ic('chart', 13), h('span', null, prev)) : null,
        h('div', { class: 'pb-dots' }, L.map(function (x, i) { return h('i', { class: i < k ? 'past' : (i === k ? 'cur' : '') }); }))),
      h('div', { class: 'pb-acts' },
        h('button', { class: 'btn sm', onclick: function () { if (close) close(); self.openPage('era', null, { root: true }); } }, '查看变化'),
        h('button', { class: 'iconbtn', 'aria-label': '关闭', onclick: function () { if (close) close(); } }, ic('close'))),
      h('i', { class: 'pb-life' }));
    this.histHost.prepend(box);
    snd('chime');
    close = this.histLife(box, 11000);
  };
  // 「历史时刻」：年份印章、史实 / 估算 / 模拟标签、事件说明与效果标签；能对应到片区或地标时可在地图上定位
  UI.prototype.histTarget = function (ev, chips) {
    const g = this.g(); if (!g) return null;
    const rid = chips.length && chips[0].region;
    if (rid) { const k = g.city.regions.findIndex(function (r) { return r.id === rid; }); if (k >= 0) return { region: k }; }
    const lm = (CM.DATA.landmarks || []).filter(function (x) { return x.name && x.name.length >= 3 && String(ev.title).indexOf(String(x.name).replace(/（.*）/, '')) >= 0; })[0];
    return lm ? { x: lm.x, y: lm.y, name: lm.name } : null;
  };
  // 城市纪事报（v2.3）：报头（城市与版面）、出版年月、衬线大标题、两行导语（点击展开全文）、史实 / 估算 / 模拟印章与影响标签。
  // 贴在地图右下角，最多同时两份；悬停暂停计时，点击导语展开、再点收起
  const NEWS_MAST = function (ev) { return '城市纪事 · ' + (CM.DATA.city || '') + (ev && ev.econ ? ' · 财经' : ''); };
  const newsDate = function (ev) { return ev.y + ' 年 ' + (ev.m || 1) + ' 月'; };
  UI.prototype.showHistCard = function (ev) {
    const self = this, chips = CM.Eras ? CM.Eras.fxChips(ev.fx) : [], tgt = ev.econ ? null : this.histTarget(ev, chips);
    const tagCls = { '史实': 'hist', '模拟': 'sim' }[ev.tag] || 'info';
    let close = null;
    const lead = ev.desc ? h('p', { class: 'nc-lead', 'data-tip': '点击展开或收起全文', onclick: function () { lead.classList.toggle('open'); } }, ev.desc) : null;
    const box = h('article', { class: 'news-card' + (ev.econ ? ' econ' + (ev.neg ? ' neg' : '') : '') },
      h('header', { class: 'nc-mast' }, h('b', null, NEWS_MAST(ev)), h('span', null, newsDate(ev)),
        h('span', { class: 'nc-acts' },
          tgt ? h('button', { class: 'iconbtn', 'data-tip': '在地图上查看', onclick: function () { if (tgt.region != null) self.locateRegion(tgt.region); else self.locatePoint(tgt.x, tgt.y, tgt.name, 2.5); } }, ic('locate', 14)) : null,
          h('button', { class: 'iconbtn', 'aria-label': '关闭', onclick: function () { if (close) close(); } }, ic('close', 14)))),
      h('h4', { class: 'nc-head' }, ev.econ ? h('span', { class: 'nc-trend ' + (ev.neg ? 'down' : 'up') }, ev.neg ? '▼' : '▲') : null, ev.title),
      lead,
      chips.length || ev.econ ? h('div', { class: 'nc-foot' }, ev.econ ? h('span', { class: 'nc-note' }, '对本城影响' + (ev.lvl || '')) : null,
        chips.map(function (c) { return h('span', { class: 'hc-chip ' + (c.up ? 'up' : 'down') }, ic(c.icon, 12), c.text); })) : null,
      h('span', { class: 'nc-stamp ' + tagCls }, ev.tag || '史实'),
      h('i', { class: 'hc-life' }));
    this.newsHost.appendChild(box);
    snd('notify');
    close = this.histLife(box, 10000 + Math.min(5000, String(ev.desc || '').length * 45));
  };
  UI.prototype.showHistDigest = function (list) {
    const self = this;
    let close = null;
    const rows = list.slice(-5).map(function (ev) { return h('li', null, h('b', null, ev.y + '.' + (ev.m || 1)), h('span', null, (ev.econ ? (ev.neg ? '▼ ' : '▲ ') : '') + ev.title)); });
    const box = h('article', { class: 'news-card digest' },
      h('header', { class: 'nc-mast' }, h('b', null, NEWS_MAST(null)), h('span', null, '本期要闻 · ' + list.length + ' 则'),
        h('span', { class: 'nc-acts' },
          h('button', { class: 'iconbtn', 'data-tip': '城市纪事', onclick: function () { if (close) close(); self.openStats('milestones'); } }, ic('book', 14)),
          h('button', { class: 'iconbtn', 'aria-label': '关闭', onclick: function () { if (close) close(); } }, ic('close', 14)))),
      h('ul', { class: 'nc-list' }, rows),
      list.length > 5 ? h('p', { class: 'nc-more' }, '另有 ' + (list.length - 5) + ' 则，见城市纪事') : null,
      h('i', { class: 'hc-life' }));
    this.newsHost.appendChild(box);
    snd('notify');
    close = this.histLife(box, 13000);
  };

  UI.prototype.updateBanner = function () {
    const g = this.g();
    const items = g.econ.warnings().map(function (w) { return { cls: w.level, icon: 'warn', text: w.text, page: 'finance' }; });
    if (!g.model.settled && g.netVersion > 0) items.push({ cls: 'info', icon: 'metro', text: '交通数据正在更新，居民出行选择正在重新计算…', page: null });
    if (g.econ.failed) items.unshift({ cls: 'danger', icon: 'error', text: '经营挑战已失败（点击查看）', page: 'failed' });
    const key = JSON.stringify(items);
    if (key === this._bannerKey) return;
    this._bannerKey = key;
    this.banner.innerHTML = '';
    const self = this;
    for (const it of items) this.banner.appendChild(h('div', { class: 'b ' + it.cls, onclick: function () { if (it.page === 'failed') self.showFailure(g.econ.failed); else if (it.page) self.openPage(it.page); } }, ic(it.icon), it.text));
  };

  // ======================== 提示 ========================
  const TOAST = { good: ['check', 'b-green'], bad: ['error', 'b-red'], info: ['info', 'b-blue'], warn: ['warn', 'b-orange'], money: ['coin', 'b-gold'], task: ['flag', 'b-violet'] };
  // act：可选的操作按钮 { label, fn }（如「查看报告」）；有操作的提示停留更久
  UI.prototype.toast = function (text, kind, act) {
    const k = TOAST[kind] || TOAST.info;
    const life = act ? 6500 : (kind === 'bad' ? 4500 : 3400);
    const close = function () { if (t.classList.contains('out')) return; t.classList.add('out'); setTimeout(function () { t.remove(); }, 320); };
    const t = h('div', { class: 'toast t-' + (kind || 'info') + (act ? ' has-act' : ''), onclick: close }, h('span', { class: 'badge ' + k[1] }, ic(k[0])), h('span', { class: 'tx' }, text),
      act ? h('button', { class: 'btn sm toast-act', onclick: function (e) { e.stopPropagation(); close(); act.fn(); } }, act.label) : null,
      h('i', { class: 'life', style: { animationDuration: life + 'ms' } }));
    this.toasts.appendChild(t);
    while (this.toasts.children.length > 4) this.toasts.firstChild.remove();
    if (kind === 'bad') snd('error'); else if (kind === 'good') snd('good'); else if (kind === 'warn') snd('warn'); else snd('notify');
    setTimeout(close, life);
  };
  UI.prototype.setTooltip = function (tip, sx, sy) {
    const el = this.tip;
    if (!tip) { el.classList.remove('on'); return; }
    // 空值（null、undefined、空串，或含 "null"/"undefined" 的拼接文字）不显示
    const ok = function (v) { return v != null && v !== '' && !/(^|[^a-z])(null|undefined|NaN)([^a-z]|$)/.test(String(v)); };
    const lines = (tip.lines || []).filter(ok), title = ok(tip.title) ? tip.title : '';
    if (!title && !lines.length) { el.classList.remove('on'); return; }
    const key = title + '|' + lines.join('|');
    if (key !== this._tipKey) {
      el.innerHTML = '';
      if (title) el.appendChild(h('div', { class: 't' }, title));
      for (const l of lines) el.appendChild(h('div', { class: 'm' }, l));
      this._tipKey = key;
    }
    el.classList.toggle('bad', !!tip.bad);
    el.classList.add('on');
    this._tipBox = { sx: sx, sy: sy, w: el.offsetWidth, h: el.offsetHeight };
    this.placeTip(this.tools ? this.tools.tagRect : null);
  };
  // 提示框默认在光标右下；avoid（绘线、建站时光标下方的预览站名）被盖住时依次改到右上、左上、站名下方
  UI.prototype.placeTip = function (avoid) {
    const b = this._tipBox, el = this.tip;
    if (!b || !el.classList.contains('on')) return;
    const w = b.w, hh = b.h, W = window.innerWidth, H = window.innerHeight;
    const right = b.sx + 18 + w > W - 8 ? b.sx - w - 14 : b.sx + 18, above = b.sy - hh - 14;
    let x = right, y = b.sy + 18 + hh > H - 8 ? above : b.sy + 18;
    if (avoid) {
      const clear = function (px, py) { return py >= 8 && py + hh <= H - 8 && px >= 8 && px + w <= W - 8 && !(px < avoid.x1 && px + w > avoid.x0 && py < avoid.y1 && py + hh > avoid.y0); };
      if (!clear(x, y)) for (const c of [[right, above], [b.sx - w - 14, above], [right, avoid.y1 + 4], [avoid.x1 + 6, avoid.y0]]) if (clear(c[0], c[1])) { x = c[0]; y = c[1]; break; }
    }
    if (b.x !== x) { b.x = x; el.style.left = x + 'px'; }
    if (b.y !== y) { b.y = y; el.style.top = y + 'px'; }
  };

  // ======================== 工具坞与视图 ========================
  UI.prototype.renderToolbar = function () {
    const g = this.g(), t = this.tools ? this.tools.tool : 'select';
    for (const k of ['select', 'station', 'line', 'edit', 'demolish']) this.tbtns[k].classList.toggle('on', t === k);
    // 当前工具的滑动高亮
    const ab = this.tbtns[t];
    if (ab && ab.offsetWidth) {
      this.toolInd.style.width = ab.offsetWidth + 'px';
      this.toolInd.style.transform = 'translateX(' + ab.offsetLeft + 'px)';
      this.toolInd.classList.toggle('danger', t === 'demolish');
      this.toolInd.classList.add('ready');
    } else if (!ab) this.toolInd.classList.remove('ready');   // 测距不在工具栏上
    const sp = g ? g.speed : 0;
    // 暂停键：运行时显示「暂停」，暂停时显示「继续」并以琥珀色提示
    const pz = this.tbtns.pause;
    if (pz._paused !== (sp === 0)) { pz._paused = sp === 0; pz.innerHTML = ''; pz.appendChild(ic(sp === 0 ? 'play' : 'pause')); pz.setAttribute('data-tip', sp === 0 ? '继续' : '暂停'); }
    pz.classList.toggle('on', sp === 0);
    this.tbtns.s1.classList.toggle('on', sp === 1);
    this.tbtns.s2.classList.toggle('on', sp === 2);
    this.tbtns.s3.classList.toggle('on', sp === 3);
    this.tbtns.s4.classList.toggle('on', sp === 4);
    for (const n of [3, 4]) this.tbtns['s' + n].setAttribute('aria-checked', sp === n ? 'true' : 'false');
    const fold = this.timeOptions.speed, high = sp >= 3;
    fold.value.textContent = high ? CFG.time.speeds[sp - 1] + '×' : '';
    fold.value.classList.toggle('gone', !high); fold.button.classList.toggle('has-on', high);
    const pk = !!CM.Settings.get('peakSlow');
    this.tbtns.peak.classList.toggle('on', pk);
    this.tbtns.peak.setAttribute('aria-checked', pk ? 'true' : 'false');
    this.tbtns.peak.setAttribute('data-tip', '高峰慢放：' + (pk ? '已开启' : '已关闭') + ' · 开启后工作日早高峰（7–9 时）与晚高峰（17–19 时）自动按 1× 运行，高峰结束后恢复所选速度');
    const iso = this.R.cam.view === 1, vb = this.tbtns.view;
    if (vb._iso !== iso) {
      vb._iso = iso; vb.replaceChildren(ic(iso ? 'view2d' : 'view3d'), h('span', { class: 'lb' }, iso ? '2D' : '2.5D'));
      vb.setAttribute('data-tip', iso ? '切换到 2D 地图' : '切换到 2.5D 城市');
    }
    fold.button.classList.toggle('peak', pk);
    if (this.layerPanelOpen()) this.renderLayerPanel();
    this.tbtns.under.classList.toggle('on', this.R.cam.tu === 1);
    if (this.tbtns.grid) this.tbtns.grid.classList.toggle('on', !!(CM.Grid && CM.Grid.on()));
    this.renderToolOpts();
    if (g) this.pauseChip.classList.toggle('hidden', !(sp === 0 && !g.jumping && this.screen.classList.contains('hidden')));
  };
  UI.prototype.setSpeed = function (s) {
    this.closeTimeOptions();
    const g = this.g(); if (!g || g.jumping) return;
    s = U.clamp(s, 0, CFG.time.speeds.length);
    if (g.econ.failed && s > 0) { this.toast('经营挑战已失败，请选择后续操作', 'bad'); this.showFailure(g.econ.failed); return; }
    if (s > 0) this.prevSpeed = s;
    if (s !== g.speed) snd(s === 0 ? 'pause' : 'play');
    const was = g.speed;
    g.setSpeed(s); this.renderToolbar();
    if (s === 0 && was > 0 && !this.isSaved()) this.scheduleAutosave();   // 暂停时自动保存当前进度
  };
  UI.prototype.togglePause = function () { const g = this.g(); if (!g) return; this.setSpeed(g.speed > 0 ? 0 : (this.prevSpeed || 1)); };
  // 高峰慢放：设置长期保存；只改变高峰期间的时钟倍数，所选速度不变
  UI.prototype.togglePeakSlow = function () {
    const on = !CM.Settings.get('peakSlow');
    CM.Settings.set('peakSlow', on); snd('toggle');
    this.renderToolbar();
    this.toast(on ? '已开启高峰慢放：工作日 7–9 时与 17–19 时自动按 1× 运行，便于观察高峰运营；高峰结束后恢复所选速度' : '已关闭高峰慢放：全天按所选速度运行', 'info');
  };
  UI.prototype.setView = function (iso) { if (this.R.cam.view !== (iso ? 1 : 0)) snd('swoosh'); this.R.setView(iso); this.renderToolbar(); };
  UI.prototype.resetView = function () { this.R.fitAllSmooth(); snd('swoosh'); };
  UI.prototype.toggleView = function () { this.setView(this.R.cam.view !== 1); };
  UI.prototype.toggleUnder = function () { snd('swoosh'); this.R.setUnder(this.R.cam.tu !== 1); this.renderToolbar(); };
  // 经纬网格（视图工具）：开关保存在本机；吸附只在网格显示时生效，默认 G 显示、Shift+G 吸附。
  UI.prototype.toggleGrid = function () { if (!CM.Grid) return; CM.Grid.toggle(); snd('toggle'); };
  UI.prototype.toggleGridSnap = function () {
    if (!CM.Grid) return;
    if (!CM.Grid.on()) { CM.Grid.toggle(); if (!CM.Settings.get('gridSnap')) CM.Grid.toggleSnap(); }
    else CM.Grid.toggleSnap();
    snd('toggle');
    this.toast(CM.Grid.snapOn() ? '已开启网格吸附：新车站、线路与转弯点落在网格交叉点（' + CM.Grid.describe(this.R) + '，随缩放变化）' : '已关闭网格吸附', 'info');
  };
  // 浅色 / 深色：游戏顶栏与开始界面上的按钮快速切换；完整选项（含跟随系统）在「设置 → 画面」
  UI.prototype.toggleTheme = function () { CM.Settings.set('theme', document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'); snd('toggle'); };
  UI.prototype.renderThemeBtns = function () {
    const dark = CM.Settings.resolvedTheme() === 'dark';
    for (const b of [this.hbtns && this.hbtns.theme, this.startTheme]) {
      if (!b) continue;
      // 图标切换时旋转弹入（太阳 ↔ 月亮），首次绘制不播放
      const was = b.dataset.dark, now = dark ? '1' : '0';
      b.innerHTML = ''; const svg = ic(dark ? 'sun' : 'moon'); b.appendChild(svg);
      if (was !== undefined && was !== now && !CM.Settings.reducedMotion()) svg.classList.add('theme-ico-in');
      b.dataset.dark = now;
      b.setAttribute('data-tip', dark ? '切换为浅色模式' : '切换为深色模式');
    }
  };
  UI.prototype.toggleSound = function () { CM.Settings.set('sound', !CM.Settings.get('sound')); if (CM.Settings.get('sound')) snd('toggle'); this.toast(CM.Settings.get('sound') ? '音效已开启' : '音效已关闭', 'info'); };
  UI.prototype.openStats = function (tab) { if (CM.Stats && this.g()) { this.toggleLayerPanel(false); this.closeTimeOptions(); this.tools.cancelDrag(); snd('open'); CM.Stats.open(this, typeof tab === 'string' ? tab : null); } };
  UI.prototype.openNetMap = function () {
    this.toggleLayerPanel(false); this.closeTimeOptions();
    if (!CM.NetMap || !this.g()) return;
    this.tools.cancelDrag();
    if (CM.NetMap.isOpen()) { CM.NetMap.close(); return; }
    this.closeSearch(); snd('open'); CM.NetMap.open(this);
  };
  UI.prototype.jump = function (n) {
    this.closeTimeOptions();
    const g = this.g(); if (!g) return;
    if (g.econ.failed) { this.showFailure(g.econ.failed); return; }
    if (!g.startJump(n)) this.toast('正在结算，请稍候', 'info');
  };
  // 切换工具：不再占用右侧面板，工具选项显示在底部工具条上方
  UI.prototype.onToolChange = function (t) {
    snd('tool');
    this.renderToolbar();
    if (this.topIs(['build']) && !this.g().draft) this.closePanel();
    if (this.multi && this.topIs(['multi'])) this.renderPage(false);   // 切到或切出拆除工具时，多选页随之变为批量拆除或批量修改
  };
  // 工具选项条：绘线时显示正在绘制的线路（可切换为新线路或支线）、建设方式与新站规模
  UI.prototype.lineColorInput = function (getColor, onPick, prefix) {
    const self = this, label = prefix || '';
    const choose = function (value) {
      if (self._replacingToolOpts || self._replacingPage || !/^#[0-9a-f]{6}$/i.test(value)) return;
      onPick(value.toLowerCase()); box.syncColor();
    };
    const picker = h('input', { type: 'color', class: 'lc-picker', value: getColor(), 'aria-label': label + '自定义颜色', onchange: function () { choose(picker.value); } });
    const preview = h('span', { class: 'lc-preview', style: { background: getColor() } });
    const box = h('div', { class: 'lc-cur' }, preview,
      h('label', { class: 'btn sm lc-custom', 'data-tip': '用取色器选择任意颜色' }, picker, ic('pencil', 14), '自定义'));
    box.syncColor = function () { const c = getColor(); preview.style.background = c; picker.value = /^#[0-9a-f]{6}$/i.test(c) ? c : '#000000'; };
    return box;
  };
  UI.prototype.renderToolOpts = function () {
    const g = this.g(), T = this.tools, el = this.toolopts;
    if (!el) return;
    if (!g || !T || T.tool === 'select') {
      el.classList.add('hidden'); this._replacingToolOpts = true;
      try { el.innerHTML = ''; } finally { this._replacingToolOpts = false; }
      this._toKey = null; return;
    }
    const net = g.draft ? g.draft.net : g.net;
    const gridOn = !!(CM.Grid && CM.Grid.on()), snapOn = !!(CM.Grid && CM.Grid.snapOn());
    const colorLine = T.chain && net.lines[T.lineChoice];
    const lineColor = colorLine ? colorLine.color : T.nextLineColor(true);
    const nMulti = this.multi ? this.multi.stations.size + this.multi.segs.size : 0;
    const key = [T.tool, T.chain, T.lineChoice, T.buildType, T.stationSize, T.curveMode, T.newLineSpeed, g.draft ? g.draft.ver : 0, g.clock.y, gridOn, snapOn, lineColor, nMulti, T.meas.pts.length].join('|');
    if (key === this._toKey && !el.classList.contains('hidden')) return;
    this._toKey = key;
    const self = this, mc = CFG.metro, y = g.clock.y;
    const segc = function (cur, opts, set) {
      const c = h('div', { class: 'seg-ctl sm' });
      for (const o of opts) c.appendChild(h('button', { class: cur === o[0] ? 'on' : '', 'data-tip': o[2] || null, 'data-silent': '1', onclick: function () { if (cur !== o[0]) { set(o[0]); snd('soft'); self.renderToolOpts(); } } }, o[3] ? h('span', { class: 'dot', style: { background: o[3] } }) : null, o[1]));
      return c;
    };
    const grp = function (label, ctl) { return h('div', { class: 'to-grp' }, h('span', { class: 'to-k' }, label), ctl); };
    const hint = function (icon, text) { return h('div', { class: 'to-hint', 'data-tip': gridOn || T.tool === 'line' ? text : null }, ic(icon), h('span', null, text)); };
    // 网格吸附（只在显示经纬网格时出现）
    const snapCtl = function () {
      if (!gridOn) return [];
      const b = h('button', { class: snapOn ? 'on' : '', 'aria-pressed': snapOn ? 'true' : 'false', 'data-silent': '1', 'data-act': 'view.gridSnap',
        'data-tip': snapOn ? '已吸附：新车站、线路点与转弯点落在网格交叉点（间隔随缩放变化）；点击关闭' : '点击开启：新车站、线路点与转弯点落在网格交叉点',
        onclick: function () { CM.Grid.toggleSnap(); snd('soft'); } }, ic('graticule', 14), '吸附交点');
      return [h('span', { class: 'to-sep' }), h('div', { class: 'seg-ctl sm' }, b)];
    };
    const typeCtl = grp('方式', segc(T.buildType, [['underground', '地下', '造价最高；越江为隧道，可穿越山体与保护建筑'], ['surface', '地面', '造价最低；越江为桥梁，两条地面线不能平交'], ['elevated', '高架', '造价居中；越江为桥梁']], function (v) { T.buildType = v; }));
    const sizeCtl = function (label) { return grp(label, segc(T.stationSize, ['S', 'M', 'L'].map(function (sz) { return [sz, mc.sizeName[sz].replace('型', ''), mc.sizeName[sz] + '车站：' + U.fmtInt(mc.stationCap[sz]) + ' 人次/时 · 编组上限 ' + mc.carsBySize[sz] + ' 节 · 约 ' + U.fmtMoney(M.stationCost(T.buildType, sz, y))]; }), function (v) { T.stationSize = v; })); };
    this._replacingToolOpts = true;
    try { el.innerHTML = ''; } finally { this._replacingToolOpts = false; }
    if (T.tool === 'line') {
      if (!T.chain || !net.stations[T.chain]) el.appendChild(hint('route', '点击空地开始新线路 · 点击线路端点继续延长'));
      else {
        const opts = [['new', T.lineName('new').replace('（新）', ''), '从「' + net.stations[T.chain].name + '」开始一条新线路（与已有线路换乘）', T.nextLineColor()]];
        for (const lid of M.stationLines(net, T.chain)) {
          const tp = M.lineTopo(net, lid), L = net.lines[lid];
          if (tp.topo === 'loop' || tp.topo === 'invalid') continue;
          const end = tp.adj && tp.adj.get(T.chain) && tp.adj.get(T.chain).length === 1;
          opts.push([lid, (end ? '延长 ' : '') + L.name + (end ? '' : ' 支线'), end ? '继续延长 ' + L.name : '从这里分出 ' + L.name + ' 的支线', AX.line(L)]);
        }
        if (T.lineChoice !== 'new' && net.lines[T.lineChoice] && !opts.some(function (o) { return o[0] === T.lineChoice; })) opts.push([T.lineChoice, net.lines[T.lineChoice].name, '', AX.line(net.lines[T.lineChoice])]);
        el.appendChild(grp('线路', segc(T.lineChoice, opts, function (v) { T.lineChoice = v; T.lineLock = true; })));
      }
      const colors = this.lineColorInput(function () { return colorLine ? colorLine.color : T.nextLineColor(true); }, function (c) {
        if (colorLine) { self.setLineLook(colorLine.id, { color: c }); self.refreshObjectPage(); }
        else { T.newLineColor = c; self.renderToolOpts(); }
        const rc = (CM.Settings.get('recentColors') || []).filter(function (x) { return x !== c; }); rc.unshift(c); CM.Settings.set('recentColors', rc.slice(0, 8));
      }, '绘线');
      const colorGroup = grp(colorLine ? '线路颜色' : '新线颜色', colors);
      colorGroup.classList.add('to-color');
      colorGroup.setAttribute('data-tip', (colorLine ? '修改当前线路整条线的颜色，立即生效且不产生费用' : '为即将新建的线路选色，预览与建成后的线路使用同一颜色') + (AX.enabled() ? '；色盲辅助已开启，地图使用辅助配色，所选原色会保留' : ''));
      // 线形（v2.1）：平滑曲线把 Shift+点击的转弯点当作控制柄；穿点为原画法，曲线逐点穿过转弯点
      const curveCtl = grp('线形', segc(T.curveMode, [['smooth', '平滑', '平滑曲线：Shift+点击放置控制柄'], ['pass', '穿点', '穿过转弯点：线路逐点经过，适合贴着道路走线']], function (v) { T.curveMode = v; CM.Settings.set('curveMode', v); }));
      // 运行速度（v2.5）：新线路在这里选；延长既有线路时沿用该线的速度（在线路详情「列车运营」中调整）
      const speedCtl = grp('速度', colorLine
        ? h('span', { class: 'tag', 'data-tip': '本线最小转弯半径 ' + M.minRadius(colorLine) + ' m；可在线路详情「列车运营」中调整' }, M.lineKmh(colorLine) + ' km/h')
        : segc(T.newLineSpeed || 80, mc.speedGrades.filter(function (x) { return !CM.Fleet || CM.Fleet.speedOpen(g.mapId, y, x.kmh).ok; }).map(function (x) { return [x.kmh, String(x.kmh), x.kmh + ' km/h：最小转弯半径 ' + x.minR + ' m，运营成本 ×' + x.ops.toFixed(2)]; }), function (v) { T.newLineSpeed = v; }));
      el.append(colorGroup, h('span', { class: 'to-sep' }), typeCtl, sizeCtl('新站'), curveCtl, speedCtl);
      el.append.apply(el, snapCtl());
      if (T.chain) el.appendChild(h('button', { class: 'btn sm ghost', 'data-tip': '结束本次绘线', 'data-key-pre': '右键', 'data-act': 'build.finish', onclick: function () { T.endChain(); } }, ic('check'), '完成'));
    } else if (T.tool === 'station') {
      el.append(hint('station', '点击空地建站 · 点击轨道插入车站'), h('span', { class: 'to-sep' }), typeCtl, sizeCtl('规模'));
      el.append.apply(el, snapCtl());
    } else if (T.tool === 'edit') {
      el.appendChild(hint('pencil', '拖动车站或圆点调整线形 · 拖动菱形增加转弯点 · 双击删除转弯点 · 选中车站后拖动旋转手柄调整站台方向 · Ctrl+点击多选'));
      el.append.apply(el, snapCtl());
    } else if (T.tool === 'measure') {
      el.append(hint('ruler', '依次点击量距离 · 靠近车站时吸附 · 右键结束'), h('span', { class: 'to-sep' }), typeCtl);
      if (T.meas.pts.length) el.appendChild(h('button', { class: 'btn sm ghost', onclick: function () { T.clearMeasure(); } }, '清除'));
      el.appendChild(h('button', { class: 'btn sm ghost', 'data-key': 'Esc', onclick: function () { T.setTool('select'); } }, ic('close'), '退出测距'));
    } else if (T.tool === 'demolish') {
      if (nMulti) el.append(hint('bulldozer', '已选 ' + nMulti + ' 项 · 点击已选对象或按 Enter 拆除 · 点击别处取消'), h('span', { class: 'to-sep' }),
        h('button', { class: 'btn sm danger', 'data-tip': '拆除所选（进入草案，可一次撤销）', onclick: function () { self.demolishMulti(); } }, ic('bulldozer'), '拆除所选'),
        h('button', { class: 'btn sm ghost', 'data-key': 'Esc', onclick: function () { self.clearMulti(); } }, '取消选择'));
      else el.appendChild(hint('bulldozer', '悬停查看变化 · 点击拆除 · Ctrl+点击多选 · Shift+拖动框选'));
    }
    el.classList.toggle('has-snap', gridOn && T.tool !== 'demolish' && T.tool !== 'measure');   // 窄窗口中把说明文字收成图标，给吸附开关留出位置
    el.classList.toggle('has-color', T.tool === 'line');
    el.classList.remove('hidden');
  };
  // 绘线起点是多条线路的端点时：在车站旁弹出选择框，确认延长哪条线路（或改为新线路）。
  // 默认项已预选（当前选中的线路优先）；不选择而直接继续点击地图时按默认项绘制。数字键 1–9 选择，Esc 关闭
  UI.prototype.showLinePicker = function (sid, lids) {
    this.closeLinePicker();
    const g = this.g(), T = this.tools, net = g.draft ? g.draft.net : g.net, s = net.stations[sid];
    if (!s) return;
    const self = this, opts = [];
    for (const lid of lids) {
      const L = net.lines[lid], tp = M.lineTopo(net, lid);
      // 线路另一端的终点名，帮助区分方向相近的线路
      const other = (tp.leaves || []).filter(function (x) { return x !== sid; }).map(function (x) { return net.stations[x] && net.stations[x].name; }).filter(Boolean);
      opts.push({ lid: lid, color: AX.line(L), label: '延长 ' + L.name, sub: (other.length ? '另一端：' + other.slice(0, 2).join('、') + ' · ' : '') + tp.stations.length + ' 站' });
    }
    opts.push({ lid: 'new', color: T.nextLineColor(), label: '新建线路', sub: '从「' + s.name + '」开始，与已有线路换乘' });
    const box = h('div', { class: 'line-picker glass', role: 'dialog', 'aria-label': '选择要延长的线路' },
      h('div', { class: 'lp-h' }, ic('route', 15), h('b', null, '「' + s.name + '」是 ' + lids.length + ' 条线路的端点'), h('button', { class: 'iconbtn', 'data-tip': '关闭（保留当前选择）', 'data-key': 'Esc', onclick: function () { self.closeLinePicker(); } }, ic('close', 15))),
      h('div', { class: 'lp-sub tiny muted' }, '选择要继续绘制的线路，然后点击车站或空地'));
    const btns = opts.map(function (o, i) {
      const b = h('button', { class: 'lp-opt' + (T.lineChoice === o.lid ? ' on' : ''), onclick: function () { pick(i); } },
        h('kbd', null, String(i + 1)), h('span', { class: 'lp-sw', style: { background: o.color } }), h('span', { class: 'grow' }, h('b', null, o.label), h('small', null, o.sub)), T.lineChoice === o.lid ? ic('check', 15) : null);
      box.appendChild(b);
      return b;
    });
    const pick = function (i) {
      const o = opts[i]; if (!o || T.chain !== sid) return false;
      T.lineChoice = o.lid; T.lineLock = true;
      snd('soft'); self.renderToolOpts(); self.closeLinePicker();
      self.toast(o.lid === 'new' ? '从「' + s.name + '」开始新建线路' : '从「' + s.name + '」' + o.label, 'info');
      return true;
    };
    document.body.appendChild(box);
    box._place = function () {
      const v = self.viewport(), z = CM.Settings.get('uiScale') || 1, q = self.R.P(s.x, s.y, 0);
      const top = self.compact() ? self.top.getBoundingClientRect().bottom + 6 : v.top + 8;
      const bottom = self.compact() ? Math.min(v.bottom, self.toolbar.getBoundingClientRect().top - 8) : v.bottom;
      box.style.maxWidth = Math.max(0, v.right - v.left - 16) / z + 'px';
      box.style.maxHeight = Math.max(0, bottom - top - 8) / z + 'px';
      const r = box.getBoundingClientRect();
      let x = q.x + 22;
      if (x + r.width > v.right - 8) x = q.x - r.width - 22;
      box.style.left = U.clamp(x, v.left + 8, Math.max(v.left + 8, v.right - r.width - 8)) / z + 'px';
      box.style.top = U.clamp(q.y - r.height / 2, top, Math.max(top, bottom - r.height - 8)) / z + 'px';
    };
    box._place();
    this.linePicker = { el: box, sid: sid, pick: pick, btns: btns };
  };
  UI.prototype.closeLinePicker = function () {
    if (!this.linePicker) return;
    const el = this.linePicker.el; this.linePicker = null;
    el.classList.add('out'); setTimeout(function () { el.remove(); }, 180);
  };
  UI.prototype.escape = function () {
    if (this.linePicker) { this.closeLinePicker(); return; }
    if (CM.Stats && CM.Stats.isOpen()) { CM.Stats.close(); return; }
    if (CM.NetMap && CM.NetMap.isOpen()) { CM.NetMap.close(); return; }
    if (!this.screen.classList.contains('hidden') && this.screenEsc) { this.screenEsc(); return; }
    if (this.dropdown) { this.closeMenu(); return; }
    if (this.layerPanelOpen()) { this.toggleLayerPanel(false); return; }
    if (this.searchEl) { this.closeSearch(); return; }
    if (this.R.hl) { this.R.setHighlight(null); return; }
    if (this.multi) { this.clearMulti(); return; }
    if (this.stack.length) { this.closePanel(); return; }   // Esc 先收起右侧面板（指标自带的图层随之恢复），再按一次关闭仍开着的图层
    if (this.layer !== 'none') { this.setLayer('none'); return; }
    this.select(null);
  };

  // ======================== 草案栏 ========================
  UI.prototype.renderDraftbar = function () {
    const g = this.g(); const bar = this.draftbar;
    if (!g || !g.draft) { bar.classList.add('hidden'); this._dbKey = null; return; }
    const ev = g.draftEval(), can = g.canConfirm();
    const key = g.draft.ver + '|' + can.ok + '|' + Math.round(g.econ.funds) + '|' + g.draft.pred.state + '|' + g.draft.undo.length + '|' + g.draft.redo.length;
    if (key === this._dbKey) return;
    this._dbKey = key;
    bar.classList.remove('hidden');
    bar.innerHTML = '';
    const self = this, n = ev.changes.add.length + ev.changes.mod.length + ev.changes.del.length;
    bar.append.apply(bar, [
      h('button', { class: 'db-main', 'data-tip': '查看草案详情：变更、费用与效果预测', onclick: function () { self.openPage('build', null, { root: true }); } },
        h('span', { class: 'pulse' }), h('b', null, '草案'), h('span', { class: 'muted' }, n + ' 项'), h('span', { class: 'cost' }, ic('coin'), U.fmtMoney(ev.total))),
      ev.conflicts.length ? h('button', { class: 'cfbadge', 'data-tip': '查看冲突位置与解决办法', onclick: function () { self.showConflicts(); } }, ic('error'), ev.conflicts.length + ' 处冲突') : null,
      ev.warnings.length && !ev.conflicts.length ? h('button', { class: 'cfbadge warn', 'data-tip': '查看提示', onclick: function () { self.open['dr-warn'] = true; self.openPage('build', null, { root: true }); } }, ic('warn'), ev.warnings.length) : null,
      h('span', { class: 'db-sep' }),
      h('button', { class: 'iconbtn', 'data-tip': '撤销', 'data-act': 'build.undo', onclick: function () { self.undo(); }, disabled: !g.draft.undo.length }, ic('undo')),
      h('button', { class: 'iconbtn', 'data-tip': '重做', 'data-act': 'build.redo', onclick: function () { self.redo(); }, disabled: !g.draft.redo.length }, ic('redo')),
      h('button', { class: 'btn sm ghost danger', 'data-tip': '放弃全部修改（不产生费用）', onclick: function () { self.discardDraft(); } }, '放弃'),
      h('button', { class: 'btn sm primary', 'data-tip': can.ok ? '确认后立即建成并投入运营' : can.reason, 'data-act': can.ok ? 'build.confirm' : null, disabled: !can.ok, onclick: function () { self.confirmDraft(); } }, ic('hammer'), '确认建设')
    ].filter(Boolean));
  };
  // 撤销 / 重做：按钮与快捷键共用；之后结束当前绘线，下一次点击重新选择起点
  UI.prototype.undo = function () {
    if (this.tools.cancelDrag()) return true;
    const g = this.g(); if (!g || !g.undo()) return false;
    snd('undo');
    this.tools.chain = null; this.tools.bends = [];
    return true;
  };
  UI.prototype.redo = function () {
    if (this.tools.cancelDrag()) return true;
    const g = this.g(); if (!g || !g.redo()) return false;
    snd('redo');
    this.tools.chain = null; this.tools.bends = [];
    return true;
  };
  // 草案变化后：选中对象已不存在时取消选择
  UI.prototype.syncSelection = function () {
    const g = this.g(), sel = this.selection; if (!g || !sel) return;
    const net = g.draft ? g.draft.net : g.net;
    if ((sel.kind === 'station' && !net.stations[sel.id]) || (sel.kind === 'seg' && !net.segments[sel.id])) this.selection = null;
    if (this.multi) this.pruneMulti && this.pruneMulti();
  };
  // 草案变化后刷新当前的建设、车站、线路页（控件始终反映最新草案；保留展开状态与滚动位置）
  UI.prototype.refreshObjectPage = function () {
    const top = this.stack[this.stack.length - 1];
    if (!top) return;
    if (['build', 'station', 'line', 'multi'].indexOf(top.kind) < 0) return;
    const a = document.activeElement;
    if (a && this.rBody.contains(a) && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA')) { this._pendingRefresh = true; return; }
    this.renderPage(false);
  };
  // 打开冲突列表并定位到第一处
  UI.prototype.showConflicts = function () {
    const g = this.g(); if (!g || !g.draft) return;
    const ev = g.draftEval();
    this.open['dr-conflicts'] = true;
    this.openPage('build', null, { replaceTop: true });
    if (ev.conflicts.length) { const c = ev.conflicts[0]; this.hoverConflict = c.n; this.flyTo(c.x, c.y, Math.max(this.R.cam.zoom, 20)); }
    const el = this.rBody.querySelector('.cf-list');
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  UI.prototype.confirmDraft = function () {
    const g = this.g();
    // 记录新增的线路、车站与区段，用于建成反馈
    const dn = g.draft ? g.draft.net : null, on = g.net;
    const newLines = [], newSt = [], newSeg = [];
    if (dn) {
      for (const id in dn.lines) if (!on.lines[id]) newLines.push(dn.lines[id]);
      for (const id in dn.stations) if (!on.stations[id]) newSt.push(dn.stations[id]);
      for (const id in dn.segments) if (!on.segments[id]) newSeg.push(dn.segments[id]);
    }
    const r = g.confirmDraft();
    if (!r.ok) { this.toast(r.reason, 'bad'); snd('error'); return; }
    snd('build');
    const R = this.R, net = g.net;
    for (const s of newSeg) {
      const ln = net.lines[s.line]; if (!ln || !net.segments[s.id]) continue;
      try { R.addFx('trace', 0, 0, { pts: M.segGeom(net, net.segments[s.id], g.city).pts, color: AX.line(ln), type: net.segments[s.id].type }); } catch (e) { /* 几何不可用时跳过 */ }
    }
    newSt.forEach(function (s, k) { const ln = M.stationLines(net, s.id).map(function (l) { return net.lines[l]; })[0]; R.addFx('burst', s.x, s.y, { color: ln ? AX.line(ln) : '#2f6fb6', delay: 0.25 + k * 0.08, type: s.type }); });
    if (newLines.length) {
      const L = newLines[0];
      const n = M.lineTopo(net, L.id).stations.length;
      this.celebrate(L.name + ' 开通运营', n + ' 座车站 · 乘客正在规划新的出行路线', AX.line(L));
    }
    this.tools.chain = null; this.tools.bends = [];
    this.hoverConflict = null;
    this.renderDraftbar(); this.renderToolOpts();
    if (this.stack.length && this.stack[this.stack.length - 1].kind === 'build') this.rerenderPage();
  };
  UI.prototype.discardDraft = function () {
    const g = this.g(); if (!g.draft) return;
    const ev = g.draftEval();
    const self = this;
    const doIt = function () { snd('discard'); g.cancelDraft(); self.tools.chain = null; self.tools.bends = []; self.hoverConflict = null; self.toast('已放弃草案，正式网络与资金未改变', 'info'); self.renderDraftbar(); self.rerenderPage(); };
    if (!ev.changed) { doIt(); return; }
    this.confirm('放弃建设草案？', '草案中的 ' + (ev.changes.add.length + ev.changes.mod.length + ev.changes.del.length) + ' 项修改将被丢弃，不产生任何费用。', '放弃草案', doIt, true, 'trash');
  };
  // 拆除影响预览（缓存到草案变化为止）
  UI.prototype.demolishImpact = function (t) {
    const g = this.g(); if (!g || !t) return null;
    const net = g.draft ? g.draft.net : g.net, ver = g.draft ? g.draft.ver : -1;
    // 多选与单个对象分开缓存：多选时悬停其他对象不用反复重算
    const many = t.kind === 'many', slot = many ? '_impMany' : '_imp', id = many ? t.stations.concat(t.segs).join(',') : t.id, c = this[slot];
    if (c && c.net === net && c.ver === ver && c.kind === t.kind && c.id === id) return c.v;
    let v = null;
    if (many || (t.kind === 'station' && net.stations[t.id]) || (t.kind === 'seg' && net.segments[t.id])) { try { v = M.demolishImpact(net, t); } catch (e) { console.error(e); } }
    this[slot] = { net: net, ver: ver, kind: t.kind, id: id, v: v };
    return v;
  };
  // 拆除车站或区段（进入草案），并说明实际网络变化
  UI.prototype.demolish = function (t) {
    const g = this.g(); if (!g) return;
    const net = g.draft ? g.draft.net : g.net;
    const imp = this.demolishImpact(t);
    let label = '';
    if (t.kind === 'station') { const s = net.stations[t.id]; if (!s) return; label = '车站「' + s.name + '」'; }
    else { const sg = net.segments[t.id]; if (!sg) return; label = '轨道 ' + (net.lines[sg.line] ? net.lines[sg.line].name + ' ' : '') + net.stations[sg.a].name + '—' + net.stations[sg.b].name; }
    const r = g.edit(function (n) { return { notes: t.kind === 'station' ? M.removeStation(n, t.id) : M.removeSegment(n, t.id) }; });
    if (r && r.error) { this.toast(r.error, 'bad'); return; }
    snd('demolish');
    this.toast('已在草案中拆除' + label + (imp && imp.lines.length ? '：' + imp.lines.slice(0, 3).join('；') + (imp.lines.length > 3 ? ' 等' : '') : ''), 'info');
    this.select(null);
  };
  // 拆除所选（多选）：作为一步进入草案，可一次撤销
  UI.prototype.demolishMulti = function () {
    const g = this.g(), mu = this.multi; if (!g || !mu) return;
    const net = g.draft ? g.draft.net : g.net, R = this.R;
    const st = Array.from(mu.stations).filter(function (id) { return net.stations[id]; }), sg = Array.from(mu.segs).filter(function (id) { return net.segments[id]; }), n = st.length + sg.length;
    if (!n) { this.clearMulti(); return; }
    const imp = this.demolishImpact({ kind: 'many', stations: st, segs: sg });
    for (const id of st) R.addFx('dust', net.stations[id].x, net.stations[id].y);
    for (const id of sg) { const gp = M.segGeom(net, net.segments[id], g.city).pts; for (let k = 0; k < gp.length; k += Math.max(1, Math.floor(gp.length / 3))) R.addFx('dust', gp[k][0], gp[k][1], { small: true }); }
    const r = g.edit(function (nn) { return { notes: M.removeMany(nn, st, sg) }; });
    if (r && r.error) { this.toast(r.error, 'bad'); return; }
    snd('demolish');
    this.clearMulti();
    this.toast('已在草案中拆除 ' + n + ' 项' + (imp && imp.lines.length ? '：' + imp.lines.slice(0, 2).join('；') + (imp.lines.length > 2 ? ' 等' : '') : ''), 'info');
    this.select(null);
  };
  // 执行冲突的修复建议
  UI.prototype.applyFix = function (fix) {
    const g = this.g(), net = g.draft ? g.draft.net : g.net;
    if (fix.op === 'editStation') {
      const s = net.stations[fix.station]; if (!s) return;
      this.tools.setTool('edit'); this.select({ kind: 'station', id: fix.station }, true); this.openPage('build', null, { replaceTop: true });
      this.flyTo(s.x, s.y, Math.max(this.R.cam.zoom, 26));
      this.toast('已选中「' + s.name + '」：直接拖动车站到新位置', 'info');
      return;
    }
    if (fix.op === 'editSeg') {
      const s = net.segments[fix.seg]; if (!s) return;
      this.tools.setTool('edit'); this.select({ kind: 'seg', id: fix.seg }, true); this.openPage('build', null, { replaceTop: true });
      const A = net.stations[s.a], B = net.stations[s.b];
      this.flyTo((A.x + B.x) / 2, (A.y + B.y) / 2, Math.max(this.R.cam.zoom, 22));
      this.toast('已选中该区段：拖动圆点移动转弯点，拖动菱形添加转弯点', 'info');
      return;
    }
    if (fix.op === 'restoreStation') {
      const o = g.net.stations[fix.station];
      if (!o) return;
      g.edit(function (n) { const s = n.stations[fix.station]; if (s) { s.x = o.x; s.y = o.y; s.type = o.type; if (o.lv) s.lv = Object.assign({}, o.lv); else delete s.lv; CM.Metro.normalizeLevels(n); } });
      this.toast('已撤回「' + o.name + '」的位置与建设方式修改', 'good');
      return;
    }
    const r = g.edit(function (n) { return M.applyFix(n, fix); });
    if (r && r.error) { this.toast(r.error, 'bad'); return; }
    if (r && r.notes) for (const n of r.notes) this.toast(n, 'info');
    this.toast('已在草案中应用：' + fix.label, 'good');
  };

  // ======================== 图层坞 ========================
  UI.prototype.renderDock = function () {
    const card = this.legendCard;
    if (card.contains(document.activeElement)) document.activeElement.blur();
    for (const x of LAYERS) if (this.dockBtns[x.id]) this.dockBtns[x.id].classList.toggle('on', this.layer === x.id);
    const L = LAYERS.find((x) => x.id === this.layer);
    // 「图层」按钮：开启图层时显示该图层的颜色与图标
    const lb = this.layerBtn;
    if (lb && lb._layer !== this.layer) {
      lb._layer = this.layer; lb.innerHTML = '';
      lb.append(ic(L ? L.icon : 'layers'), h('span', { class: 'lb' }, '图层'));
      lb.classList.toggle('on', !!L); if (L) lb.style.setProperty('--lc', L.color); else lb.style.removeProperty('--lc');
      lb.setAttribute('data-tip', L ? '图层：' + L.name + ' · 点击更换或关闭' : '图层');
    }
    const hidden = !L || !this.g();
    card.inert = hidden; card.setAttribute('aria-hidden', hidden ? 'true' : 'false');
    if (hidden) { card.classList.add('hidden'); this.placeFeed(); return; }
    card.innerHTML = '';
    const self = this;
    const badge = h('span', { class: 'badge lc-badge' }, ic(L.icon)); badge.style.background = L.color;
    card.append(h('div', { class: 'lc-head' }, badge, h('div', { class: 'p-title' }, L.name), h('button', { class: 'iconbtn', 'data-tip': '关闭图层', onclick: function () { self.setLayer('none'); } }, ic('close'))),
      h('div', { class: 'lc-body' }, this.legend(L.id)));
    card.classList.remove('hidden');
    this.placeFeed();
  };
  UI.prototype.setLayer = function (id) {
    const changed = id !== this.layer;
    if (changed) snd('soft');
    this.layer = id; this.R.layer = id; this.R.heatKey = ''; this.renderDock();
    if (changed && this.topIs(['metric']) && !this.right.classList.contains('closed')) this.rerenderPage();
  };
  UI.prototype.layerPanelOpen = function () { return !!this.layerPanel && !this.layerPanel.classList.contains('hidden'); };
  UI.prototype.toggleLayerPanel = function (open) {
    const p = this.layerPanel, on = open == null ? !this.layerPanelOpen() : !!open;
    if (on && (!this.g() || this.blocking())) return;
    if (on === this.layerPanelOpen()) return;
    if (!on && p.contains(document.activeElement)) this.layerBtn.focus();
    p.classList.toggle('hidden', !on); p.inert = !on;
    document.body.classList.toggle('layer-panel-open', on);
    this.layerBtn.classList.toggle('open', on); this.layerBtn.setAttribute('aria-expanded', on ? 'true' : 'false');
    if (!on) { this.dockBtns = {}; this._lpKey = null; this.queueLayout(); return; }
    snd('open');
    this.closeTimeOptions();
    this.measureLayout();
    this.renderLayerPanel();
  };
  UI.prototype.renderLayerPanel = function () {
    const self = this, p = this.layerPanel;
    p.innerHTML = '';
    this.dockBtns = {};
    const rows = [];
    for (const G of LAYER_GROUPS) {
      const row = h('div', { class: 'lp-row', role: 'group', 'aria-label': G[1] });
      for (const L of LAYERS) {
        if (L.group !== G[0]) continue;
        const on = self.layer === L.id;
        const b = h('button', { class: 'lp-btn' + (on ? ' on' : ''), 'data-tip': L.name + ' · ' + L.desc, 'aria-label': L.name, 'aria-pressed': on ? 'true' : 'false',
          onclick: function () { self.setLayer(self.layer === L.id ? 'none' : L.id); self.toggleLayerPanel(false); } }, ic(L.icon));
        b.style.setProperty('--lc', L.color);
        self.dockBtns[L.id] = b; row.appendChild(b);
      }
      rows.push(row);
    }
    // 小工具：经纬网格（建站与绘线时可吸附到交叉点）、测距、线路标注、任务标记
    const S = CM.Settings, T = this.tools;
    const opt = function (icon, name, desc, on, act, fn) {
      return h('button', { class: 'lp-btn opt' + (on ? ' on' : ''), 'data-act': act, 'data-silent': '1', role: 'switch', 'aria-label': name, 'aria-checked': on ? 'true' : 'false', 'data-tip': name + ' · ' + desc, onclick: fn }, ic(icon));
    };
    const flip = function (key) { return function () { S.set(key, !S.get(key)); snd('toggle'); self.renderLayerPanel(); }; };
    rows.push(h('div', { class: 'lp-row', role: 'group', 'aria-label': '小工具' },
      opt('graticule', '经纬网格', '建站与绘线时可吸附', !!CM.Grid.on(), 'view.grid', function () { self.toggleGrid(); self.renderLayerPanel(); }),
      opt('ruler', '测距', '量距离，估算步行与乘车时间、站数和建设费', !!T && T.tool === 'measure', 'tool.measure', function () { T.setTool(T.tool === 'measure' ? 'select' : 'measure'); self.toggleLayerPanel(false); }),
      opt('lineTag', '线路标注', '在地图的线路上标出线路编号', !!S.get('lineTags'), null, flip('lineTags')),
      opt('flag', '任务标记', '在地图上标出进行中任务的地点，点击查看任务', !!S.get('taskPins'), null, flip('taskPins'))));
    rows.forEach(function (row, i) { if (i) p.appendChild(h('i', { class: 'lp-sep' })); p.appendChild(row); });
    this.placeLayerPanel();
  };
  UI.prototype.placeLayerPanel = function () {
    const p = this.layerPanel;
    // 在按钮旁展开；同时检查图例、草案、工具栏、教程及手机安全视区。
    const z = CM.Settings.get('uiScale') || 1, r = this.layerBtn.getBoundingClientRect(), v = this.viewport();
    const root = getComputedStyle(document.documentElement), compact = this.compact();
    const lo = compact ? parseFloat(root.getPropertyValue('--mobile-hud-bottom')) || v.top + 8 : v.top + 8;
    const hi = compact ? parseFloat(root.getPropertyValue('--mobile-side-bottom')) || v.bottom : v.bottom;
    p.style.maxWidth = Math.max(1, (v.w - 16) / z) + 'px';
    p.style.maxHeight = Math.max(1, (hi - lo - 8) / z) + 'px';
    const hh = p.offsetHeight * z, ww = p.offsetWidth * z;
    const obstacles = [this.legendCard, this.draftbar, this.toolopts, this.toolbar, this.right, document.getElementById('coach')].filter(function (el) {
      return el && !el.classList.contains('hidden') && !el.classList.contains('closed') && getComputedStyle(el).display !== 'none' && getComputedStyle(el).visibility !== 'hidden';
    }).map(function (el) { return el.getBoundingClientRect(); }).filter(function (b) { return b.width && b.height; });
    const xs = [r.right + 10, v.right - ww - 8, v.left + 8], ys = [r.top].concat(obstacles.map(b => b.bottom + 8), obstacles.map(b => b.top - hh - 8), [lo, hi - hh - 8]);
    let best = null;
    for (const x of xs) for (const y of ys) {
      const left = U.clamp(x, v.left + 8, Math.max(v.left + 8, v.right - ww - 8)), top = U.clamp(y, lo, Math.max(lo, hi - hh - 8));
      const overlap = obstacles.reduce(function (sum, b) { return sum + Math.max(0, Math.min(left + ww + 6, b.right) - Math.max(left - 6, b.left)) * Math.max(0, Math.min(top + hh + 6, b.bottom) - Math.max(top - 6, b.top)); }, 0);
      const score = overlap * 1000 + Math.abs(left - r.right - 10) + Math.abs(top - r.top);
      if (!best || score < best.score) best = { left, top, score };
    }
    p.style.left = (best.left / z) + 'px'; p.style.top = (best.top / z) + 'px';
  };
  UI.prototype.syncMetricLayer = function (key) {
    const p = key && this.pills[key], want = p && p.layer ? p.layer : null, a = this._autoLayer;
    if (a && a.layer !== want) { this._autoLayer = null; if (this.layer === a.layer) this.setLayer(a.prev); }
    if (want && (!this._autoLayer || this._autoLayer.layer !== want)) {
      this._autoLayer = { layer: want, prev: this.layer === want ? 'none' : this.layer };
      if (this.layer !== want) this.setLayer(want);
    }
  };
  // 依次切换分析图层（键位「依次切换分析图层」，Shift 反向）：关闭 → 第一个图层 → … → 最后一个 → 关闭
  UI.prototype.cycleLayer = function (dir) {
    const ids = ['none'].concat(LAYERS.map(function (L) { return L.id; }));
    const k = Math.max(0, ids.indexOf(this.layer));
    const next = ids[(k + (dir < 0 ? ids.length - 1 : 1)) % ids.length];
    this.setLayer(next);
    if (next !== 'none') { const L = LAYERS.find(function (x) { return x.id === next; }); if (L) this.toast('图层：' + L.name, 'info'); }
  };
  // 快速保存（键位「保存进度」）：立即保存到自动存档并提示
  UI.prototype.quickSave = function () {
    const self = this;
    if (!this.g()) return;
    this.doAutosave(true).then(function (r) { if (r && r.ok) self.toast('进度已保存', 'good'); else if (r && r.error) self.toast('未能保存：' + r.error, 'warn'); });
  };
  // 图例：只保留读图所需的色标与一句说明
  UI.prototype.legend = function (id) {
    const self = this, R = this.R;
    const box = h('div', { class: 'legend' });
    const grad = function (stops, a, b) { box.append(h('div', { class: 'bar', style: { background: 'linear-gradient(90deg,' + stops.map(AX.color).join(',') + ')' } }), h('div', { class: 'row between tiny muted' }, h('span', null, a), h('span', null, b))); };
    const li = function (col, text, kind) { col = AX.color(col); box.appendChild(h('div', { class: 'li' }, h('span', { class: kind === 'line' ? 'swatch' : (kind === 'ring' ? 'dot ring' : 'dot'), style: kind === 'ring' ? { borderColor: col } : { background: col } }), text)); };
    const opts = function (key, list) {
      const ctl = h('div', { class: 'seg-ctl sm', style: { margin: '2px 0 8px' } });
      for (const o of list) ctl.appendChild(h('button', { class: R.layerOpt[key] === o[0] ? 'on' : '', 'data-silent': '1', onclick: function () { R.layerOpt[key] = o[0]; snd('soft'); self.renderDock(); } }, o[1]));
      box.appendChild(ctl);
    };
    const CC = AX.enabled() ? AX.statuses() : CM.Renderer.CONG_COLS;
    let note = '';
    switch (id) {
      case 'pop': grad(['#ffe296', '#f99e4c', '#de5434'], '0', '6 万人/km²'); note = '每个街区的常住人口密度（每月更新）。'; break;
      case 'jobs': li('#f0963c', '以住宅为主'); li('#9aa0b0', '职住混合'); li('#3468d6', '以就业岗位为主'); note = '颜色越深，人口与岗位越密集。'; break;
      case 'cong': {
        // v2.3 重新设计：「拥堵程度」看当前时刻或工作日早高峰；「拥堵变化」与对比基准（最近一次新增车站的建设前、一年前）相比
        const g = self.g(), v = R.layerOpt.cong || 'now', diff = v === 'build' || v === 'year';
        const seg = function (list, cur, set) { const ctl = h('div', { class: 'seg-ctl sm', style: { margin: '2px 0 8px' } }); for (const o of list) ctl.appendChild(h('button', { class: cur === o[0] ? 'on' : '', 'data-silent': '1', onclick: function () { set(o[0]); snd('soft'); self.renderDock(); } }, o[1])); box.appendChild(ctl); };
        seg([['lvl', '拥堵程度'], ['diff', '拥堵变化']], diff ? 'diff' : 'lvl', function (k) { if (k === (diff ? 'diff' : 'lvl')) return; if (k === 'diff') { R._congL = v; R.layerOpt.cong = R._congD || 'build'; } else { R._congD = v; R.layerOpt.cong = R._congL || 'am'; } });
        if (diff) {
          seg([['build', '建设以来'], ['year', '一年来']], v, function (k) { R.layerOpt.cong = k; });
          const ref = g && g.congRefFor ? g.congRefFor(v) : null, DC = CM.Renderer.DIFF_COLS();
          if (ref) {
            li(DC[0], '明显缓解', 'line'); li(DC[1], '有所缓解', 'line'); li(DC[2], '基本不变', 'line'); li(DC[3], '有所加重', 'line'); li(DC[4], '明显加重', 'line');
            box.appendChild(h('div', { class: 'tiny muted', style: { margin: '6px 0 2px' } }, '对比：' + Math.floor(ref.ym / 12) + ' 年 ' + (ref.ym % 12 + 1) + ' 月' + (v === 'build' && ref.label ? '（' + ref.label + (ref.label === '手动设定' ? '' : ' 建设前') + '）' : '')));
          } else box.appendChild(h('div', { class: 'tiny muted', style: { margin: '2px 0 6px' } }, v === 'build' ? '还没有对比基准：确认一次新增车站的建设后开始记录。地图暂按早高峰拥堵程度显示。' : '年度基准在交通计算完成后记录，每年 1 月更新。地图暂按早高峰拥堵程度显示。'));
          if (g && g.compiled.routes.length) { const hm = g.model.habitMean(); box.appendChild(h('div', { class: 'lg-habit', 'data-tip': '按人口平均：车站开通后约 4 年，周边居民的出行习惯逐步转向地铁' }, h('span', null, '车站周边出行习惯'), h('i', null, h('em', { style: { width: Math.round(hm * 100) + '%' } })), h('b', null, U.fmtPct(hm, 0)))); }
          if (g) box.appendChild(h('button', { class: 'btn sm ghost', style: { marginTop: '6px' }, onclick: function () { const sn = g.congSnapshot(); if (!sn) { self.toast('交通数据正在更新，稍后再试', 'info'); return; } sn.label = '手动设定'; (g.congRef || (g.congRef = {})).build = sn; R.layerOpt.cong = 'build'; self.markUnsaved(); self.renderDock(); self.toast('已把现在设为拥堵变化的对比基准', 'good'); } }, ic('flag', 13), '从现在开始对比'));
          note = '比较工作日早高峰各主要道路的拥堵比（行驶时间 ÷ 自由流时间）：下降 0.03 以上为缓解，0.12 以上为明显缓解。地铁开通后，周边居民的出行习惯在约 4 年内逐步转向地铁、少开车，沿线道路会持续慢慢缓解；城市增长、新区开放也会让一些道路变堵。';
          break;
        }
        seg([['now', '当前时刻'], ['am', '工作日早高峰']], v, function (k) { R.layerOpt.cong = k; });
        li(CC[0], AX.enabled() ? '畅通 · 实线' : '畅通', 'line'); li(CC[1], AX.enabled() ? '缓行 · 长虚线' : '缓行', 'line'); li(CC[2], AX.enabled() ? '拥堵 · 点线' : '拥堵', 'line'); li(CC[3], AX.enabled() ? '严重拥堵 · 点划线' : '严重拥堵', 'line'); note = '颜色按实际行驶时间 ÷ 自由流时间：<1.15 畅通，1.15–1.35 缓行，1.35–1.60 拥堵，≥1.60 严重拥堵；显示较拥堵方向。可切换工作日早高峰，与任务和建设效果使用同一口径；「拥堵变化」显示地铁开通以来道路的缓解。'; break;
      }
      case 'flow': opts('flow', [['all', '全部'], ['car', CM.DATA.bg ? '非地铁' : '汽车'], ['metro', '地铁']]); if (R.layerOpt.flow === 'all') { li('#80869a', CM.DATA.bg ? '非地铁出行' : '汽车出行', 'line'); li('#2166cc', '其中乘地铁（箭头中间的蓝色部分）', 'line'); } note = '每个片区当前时段最主要的出行方向（第二方向接近时也画出）：箭头从片区指向目的地，尖端标出目的地名称；两个片区互为主要方向时画成双向箭头。线越粗出行越多，新区域开放、修建地铁后会随之变化。'; break;
      case 'cover': opts('cover', [['time', '步行时间'], ['station', '所属车站']]);
        if (R.layerOpt.cover === 'station') { li('rgba(20,162,82,0.5)', '每个颜色块为步行最近的车站（细线为分界）'); li('#d73027', '人口密集但无地铁'); }
        else { li('#1b7837', '步行 5 分钟内'); li('#5aae61', '步行 10 分钟内'); li('#acdc8c', '步行 15 分钟内'); li('#d73027', '人口密集但无地铁'); }
        li('#c0392b', '地面铁路（无道口、地道或天桥处阻隔步行）', 'line');
        note = '沿实际道路计算：河流、断路与没有通道的地面铁路会阻隔，绕行会拉长步行时间。选中车站可以查看它的步行范围。'; break;
      case 'station': opts('stView', [['flow', '全日客流'], ['load', '高峰负荷']]); opts('stDt', [['avg', '周平均'], ['wd', '工作日'], ['we', '周末']]);
        if (R.layerOpt.stView === 'load') { li('#2fa36b', '高峰小时满载率 < 60%', 'line'); li('#e8a33a', '60%–100%', 'line'); li('#d93a3a', '超过 100%（拥挤）', 'line'); li('rgba(217,58,58,0.85)', '车站高峰负荷超过能力'); note = '高峰负荷：区间断面客流 ÷ 线路运力（发车频率 × 列车定员，系统按客流自动加车，最小间隔 2 分钟）；车站为进出站与换乘人数 ÷ 车站能力。'; }
        else { opts('station', [['all', '合计'], ['in', '进站'], ['out', '出站'], ['xfer', '换乘']]); li('rgba(31,143,191,0.8)', '高峰负荷正常（< 60%）'); li('rgba(240,160,32,0.85)', '负荷较高（60%–100%）'); li('rgba(217,58,58,0.85)', '超过车站能力'); note = '全日：圆越大客流越大，颜色为高峰小时负荷；线路下方的色带为区间断面客流。'; }
        note = (self.g() && self.g().model.stDaily && self.g().compiled.routes.length ? '' : '还没有运营线路或客流仍在计算。') + note + ' 统计口径：' + { avg: '周平均（5 个工作日 + 2 个周末日）', wd: '工作日', we: '周末' }[R.layerOpt.stDt] + '。'; break;
      case 'fac': {
        opts('facP', [['all', '设施类'], ['sc', '上学'], ['sh', '购物'], ['md', '医疗'], ['lz', '休闲'], ['hb', '枢纽'], ['hw', '通勤']]);
        opts('facDt', [['wd', '工作日'], ['we', '周末']]);
        const TR = CFG.trips;
        if (R.layerOpt.facP === 'all') { for (const k of ['sc', 'sh', 'md', 'lz']) li(AX.category(TR.keys.indexOf(k), TR.color[k]), TR.name[k] + '为主的片区'); }
        else li(AX.category(TR.keys.indexOf(R.layerOpt.facP), TR.color[R.layerOpt.facP]), TR.name[R.layerOpt.facP] + '吸引（片区汇总）');
        li('#7a8699', AX.enabled() ? '圆点大小为日到访量；外环由紫到蓝表示地铁比例提高，可点击查看数值' : '圆点：重要设施（大小为日到访量，外环越绿乘地铁比例越高）', 'ring');
        note = (CM.DATA.bg ? "片区颜色为普通设施（中小学、社区商业、诊所、街区公园等）按片区汇总的吸引出行；重要设施单独计算，点击圆点查看详情。设施位置与年份为史实参考，规模为估算，到访量为模拟结果（道路、背景交通及地铁出行）。" : '片区颜色为普通设施（中小学、社区商业、诊所、街区公园等）按片区汇总的吸引出行；重要设施单独计算，点击圆点查看详情。设施位置与年份为史实参考，规模为估算，到访量为模拟结果（汽车 + 地铁出行，不含步行）。');
        break;
      }
      case 'dev': {
        opts('devK', [['pop', '人口'], ['jobs', '岗位'], ['land', '新用地'], ['pull', '地铁带动']]);
        // 地铁带动（v2.3）：车站对周边增长的吸引与线网成熟度（成熟度越高，增长越多地跟着车站与枢纽走）
        if (R.layerOpt.devK === 'pull') {
          const g = self.g(), P = g && g.metroPull ? g.metroPull() : null;
          grad(['#e2d6fa', '#966ce2', '#5c28aa'], '吸引较弱', '枢纽与商业开发');
          if (P) {
            box.appendChild(h('div', { class: 'lg-habit', 'data-tip': '按地铁步行覆盖的人口比例：覆盖 8% 起步，45% 达到满值' }, h('span', null, '线网成熟度'), h('i', null, h('em', { style: { width: Math.round(P.M * 100) + '%', background: '#7a44c8' } })), h('b', null, U.fmtPct(P.M, 0))));
            box.appendChild(h('div', { class: 'tiny muted', style: { margin: '6px 0 2px' } }, '新增人口与岗位里，车站带动的权重约为 ×' + U.fmtNum(P.w, 2) + '（线网成熟后为 ×1）'));
          } else box.appendChild(h('div', { class: 'tiny muted', style: { margin: '4px 0 2px' } }, '还没有运营中的车站。'));
          note = '每座运营车站吸引周边约 1 km 的新增人口与岗位：换乘线路越多、客流越大、车站商业开发等级越高，吸引越强；车站开通后约 4 年逐步形成。线网越成熟（地铁覆盖的人口越多），城市增长越多地跟着车站走，历史阶段预设的重点片区影响越弱——先把地铁修过去、做好车站开发，人口与岗位会随之聚集。全城增长总量不变，只改变落在哪里。';
          break;
        }
        opts('devB', [['era', '本阶段以来'], ['start', '本局以来']]);
        const g = self.g(), base = g && (R.layerOpt.devB === 'start' ? g.startBase : g.eraBase), land = R.layerOpt.devK === 'land';
        const ramp = { pop: ['#c8ecd2', '#48b278', '#147846'], jobs: ['#c4d6fa', '#5c84e6', '#2846be'], land: ['#fae2aa', '#e2a03c', '#b06014'] }[R.layerOpt.devK];
        // v2.3：色标随实际变化自适应；还没有变化时显示本阶段的重点发展片区（斜纹）
        const sc = R.devScale && R.devScale.key === R.layerOpt.devK ? R.devScale : null, months = g && base ? g.ym() - U.ymIndex(base.y, base.m) : 0;
        const amt = function (v) { return land ? U.fmtNum(v, 2) + ' km²' : U.fmtPeople(v); };
        if (sc && !sc.any) {
          grad(ramp, '规划倾向较弱', '本阶段重点发展');
          note = '对比基准' + (months > 0 ? '只有 ' + months + ' 个月' : '刚刚建立') + '，城市还没有明显变化。斜纹标出本阶段' + (land ? '' : (R.layerOpt.devK === 'jobs' ? '就业' : '人口')) + '重点增长的片区；推进几个月后，这里会显示实际的增减。';
          if (g && base && R.layerOpt.devB === 'era' && g.startBase && U.ymIndex(g.startBase.y, g.startBase.m) < U.ymIndex(base.y, base.m)) note += ' 也可以切换到「本局以来」。';
        } else {
          grad(ramp, '增加 ' + amt(sc ? sc.min : (land ? 0.05 : 300)), '增加 ' + amt(sc ? sc.full : (land ? 1 : 3000)) + ' 以上');
          li('#c83232', '减少（疏解、外迁或拆除）');
          note = base ? '对比：' + base.y + ' 年 ' + base.m + ' 月' + (R.layerOpt.devB === 'start' ? '（本局开始）' : '（' + ((CM.Eras.byId(base.id) || {}).name || '本阶段') + '开始）') + (base.joined ? '，旧存档从读档时开始比较' : '') + '。以约 1 km 的方块统计、平滑显示，地图上标出变化最大的片区；色标随变化幅度自动调整。' : '尚无对比基准。';
        }
        break;
      }
      case 'commute': {
        const sc = (R.rateScales && R.rateScales.commute) || { lo: 15, hi: 45 };
        grad(['#40aa78', '#f5c850', '#cd3232'], sc.lo + ' 分钟以内', sc.hi + ' 分钟以上');
        const dw = self.g() && self.g().model.dailyWk;
        note = '工作日早高峰，住在该片区的人从家到工作地点的门到门时间（含步行、候车、换乘、停车）' + (dw && dw.commute ? '。全市平均 ' + U.fmtNum(dw.commute, 1) + ' 分钟' : '') + '。';
        break;
      }
      case 'mshare': opts('shareDt', [['wd', '工作日'], ['we', '周末']]);
        grad(['#d6e8f5', '#5aa0dc', '#14469f'], '很少', U.fmtPct(R.rateScales && R.rateScales.mshare ? R.rateScales.mshare.hi : 0.2, 0) + ' 以上');
        note = '该片区居民全天的出行中乘地铁的比例；浅色片区是地铁还有潜力的地方。';
        break;
      case 'tod':
        li('#c9971c', '已开发：数字为等级，圈越大每月净收益越高');
        li('#d63031', '已开发但每月净亏损');
        li('#2fa36b', '尚未开发、开发后能盈利：圈越大收益越高', 'ring');
        li('#78808c', '尚未开发、开发后暂不盈利', 'ring');
        note = '车站接入运营线路后才会显示。点击车站，在详情中开发或升级商业空间。';
        break;
      case 'gap': opts('gapDt', [['wd', '工作日'], ['we', '周末']]);
        li('#c62828', '出行多，但步行 15 分钟内没有地铁站'); li('#ef8a3a', '已有地铁，但车站或区间高峰超载'); li('#7a1f1f', '重要设施：步行 15 分钟内没有地铁站', 'ring');
        note = '缺口 = 片区出发与到达的出行量 ×（1 − 地铁步行覆盖比例），按面积折算；颜色越深缺口越大。超载按高峰小时计。';
        break;
    }
    // v2.3 精简：色标与选项常显，较长的说明收进可折叠的「说明」（按图层记住展开状态）
    if (note && note.length > 36) {
      const key = 'lg-' + id, det = h('details', { class: 'lg-more' }, h('summary', null, ic('info', 13), '说明'), h('div', { class: 'note' }, note));
      if (self.open[key]) det.open = true;
      det.addEventListener('toggle', function () { self.open[key] = det.open; });
      box.appendChild(det);
    } else if (note) box.appendChild(h('div', { class: 'note', style: { marginTop: '6px' } }, note));
    return box;
  };

  // ======================== 右侧面板（页面栈） ========================
  UI.prototype.openTop = function (key) {
    const top = this.stack[this.stack.length - 1], open = !!top && !this.right.classList.contains('closed');
    if (key === 'date') this.openPage('date', null, { toggle: true, root: true });
    // 资金与经济：同一个面板的不同分页。面板已打开时再次点击同一入口收起，点击另一入口切换分页
    else if (key === 'money' || key === 'econ') {
      const want = key === 'econ' ? 'econ' : 'ov';
      if (open && top.kind === 'finance' && ((want === 'econ') === (top.id === 'econ'))) { this.closePanel(); return; }
      this.finTab = want;
      this.openPage('finance', want, { root: true });
    }
    else if (key === 'tasks') {
      if (open && top.kind === 'tasks') { this.closePanel(); return; }
      this.taskTab = 'active';
      this.openPage('tasks', 'active', { root: true });
    }
    else if (key === 'save') this.openPage('saves', null, { toggle: true, root: true });
    else this.openPage('metric', key, { toggle: true, root: true });
  };
  UI.prototype.openPage = function (kind, id, opts) {
    opts = opts || {};
    // 居民满意度详情（v2.3）融入「地铁圈」App 的满意度视图，不再从右侧面板打开
    if (kind === 'metric' && id === 'sat' && this.openVoicesApp) { this.openVoicesApp('sat'); return; }
    const top = this.stack[this.stack.length - 1];
    if (top && top.kind === kind && top.id === id && !this.right.classList.contains('closed')) { if (opts.toggle) this.closePanel(); else this.renderPage(false); return; }
    if (opts.replaceTop && top) this.stack[this.stack.length - 1] = { kind: kind, id: id };
    else if (opts.root) this.stack = [{ kind: kind, id: id }];
    else { this.stack.push({ kind: kind, id: id }); if (this.stack.length > 8) this.stack.shift(); }
    if (opts.root) this.syncMetricLayer(kind === 'metric' ? id : null);
    snd('open');
    this.renderPage(true);
  };
  UI.prototype.back = function () {
    if (this.topIs(['multi'])) this.multi = null;
    if (this.stack.length > 1) { this.stack.pop(); this.renderPage(true); }
    else this.closePanel();
  };
  UI.prototype.closePanel = function (silent) {
    if (!silent && this.stack.length) snd('close');
    this.stack = []; this.live = []; this.multi = null;
    if (this.right.contains(document.activeElement)) document.activeElement.blur();
    this.right.inert = true;
    this.right.setAttribute('aria-hidden', 'true');
    this.right.classList.add('closed');
    if (!silent && this.selection && this.selection.kind !== 'station') this.select(null, true);
    this.highlightLine = null;
    this.syncMetricLayer(null);
    this.placeFeed();
  };
  UI.prototype.rerenderPage = function () { if (this.stack.length) this.renderPage(false); if(this.opsApp)this.opsApp.refresh(); };
  UI.prototype.refreshBuild = function () {
    const top = this.stack[this.stack.length - 1];
    if (top && top.kind === 'build') this.renderPage(false);
  };
  UI.prototype.refreshPrediction = function () {
    const top = this.stack[this.stack.length - 1];
    if (!top || top.kind !== 'build' || !this.predBox) return;
    const n = this.predictionBlock();
    this.predBox.replaceWith(n); this.predBox = n;
  };
  UI.prototype.renderPage = function (anim) {
    const top = this.stack[this.stack.length - 1];
    if (!top || !this.g()) { this.closePanel(true); return; }
    this.live = [];
    // 网络刚变化、车站客流尚未按新网络统计时渲染的页面：统计完成后自动重绘一次（见 tick）
    this.pageDailyStale = !!this.g().model.dailyStale;
    const scroll = anim ? 0 : this.rBody.scrollTop;
    let page;
    try { const g = this.g(); page = M.withSegIndex([g.net, g.draft && g.draft.net], () => this['page_' + top.kind](top.id)); }
    catch (e) { console.error(e); page = { title: '详情', el: h('div', { class: 'callout bad' }, '无法显示：' + e.message) }; }
    if (!page) { this.back(); return; }
    // 标题直接改名（v2.1 第二轮）：车站、线路详情点标题即可改名；线路的彩色徽标点一下改颜色。
    // 正在改名时页面自动刷新不打断输入
    if (!(this._titleEditKey === top.kind + '|' + top.id && this.rTitle.querySelector('input'))) {
      this._titleEditKey = null;
      this.rTitle.textContent = page.title;
      this.rTitle.classList.toggle('editable', !!page.titleEdit);
      this.rTitle.onclick = page.titleEdit ? this.titleEditor.bind(this, page.titleEdit) : null;
      this.rTitle.setAttribute('data-tip', page.titleEdit ? '点击改名' : '');
      if (page.titleEdit) this.rTitle.appendChild(ic('pencil', 14, 'p-title-ico'));
    }
    const pi = top.kind === 'metric' ? (METRIC_ICON[top.id] || PAGE_ICON.metric) : (PAGE_ICON[top.kind] || ['info', 'b-slate']);
    this.rBadge.className = 'badge ' + pi[1];
    this.rBadge.innerHTML = ''; this.rBadge.appendChild(ic(pi[0]));
    if (top.kind === 'line' && page.highlightLine) { const ln = (this.g().draft ? this.g().draft.net : this.g().net).lines[page.highlightLine]; if (ln) { this.rBadge.className = 'badge'; this.rBadge.style.background = AX.line(ln); } }
    else this.rBadge.style.background = '';
    this.rBack.style.visibility = this.stack.length > 1 ? 'visible' : 'hidden';
    this.rBadge.onclick = page.badgeClick || null;
    this.rBadge.classList.toggle('clickable', !!page.badgeClick);
    this.rBadge.setAttribute('data-tip', page.badgeTip || '');
    // 移除仍聚焦的输入框可能同步触发 change；旧页面的值不能覆盖刚更新的线路外观。
    this._replacingPage = true;
    try { this.rBody.innerHTML = ''; } finally { this._replacingPage = false; }
    if (anim) page.el.classList.add('page-enter');
    this.rBody.appendChild(page.el);
    this.rBody.scrollTop = scroll;
    const wasClosed = this.right.classList.contains('closed');
    this.right.inert = false;
    this.right.setAttribute('aria-hidden', 'false');
    this.right.classList.remove('closed');
    if (wasClosed) this.placeFeed();
    this.highlightLine = page.highlightLine || null;
  };
  // 详情标题就地改名：回车或失焦保存，Esc取消；非法输入保留编辑器并提示。
  UI.prototype.titleEditor = function (spec) {
    const self = this, t = this.rTitle;
    if (t.querySelector('input')) return;
    const top = this.stack[this.stack.length - 1]; if (!top) return;
    const input = h('input', { type: 'text', class: 'p-title-in', value: spec.value, maxlength: spec.max || 16, 'aria-label': '名称' });
    let done = false;
    this._titleEditKey = top.kind + '|' + top.id;
    const finish = function (save) {
      if (done) return;
      if (save) {
        const v = input.value.trim();
        if (!v) { self.toast('名称不能为空', 'bad'); input.focus(); return; }
        if (v !== spec.value) { const r = spec.apply(v) || {}; if (r.error) { self.toast(r.error, 'bad'); input.focus(); return; } }
      }
      done = true; self._titleEditKey = null;
      self.rerenderPage();
    };
    input.addEventListener('keydown', function (e) { if (e.isComposing || e.keyCode === 229) return; if (e.key === 'Enter') { e.preventDefault(); finish(true); } else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); finish(false); } });
    input.addEventListener('blur', function () { finish(true); });
    t.textContent = ''; t.appendChild(input); input.focus(); input.select();
  };
  // 打开车站或线路详情的指定分页（概况 info / 建设 build）
  UI.prototype.openObj = function (kind, id, tab) {
    this._tab = this._tab || {}; this._tab[kind] = tab;
    const top = this.stack[this.stack.length - 1];
    if (top && top.kind === kind && top.id === id && !this.right.classList.contains('closed')) { this.renderPage(false); return; }
    this.openPage(kind, id, { replaceTop: this.topIs(['station', 'line', 'road', 'zone', 'facility']) });
  };
  UI.prototype.sec = function (key, title, summary, bodyFn, defOpen, icon) {
    const open = this.open[key] !== undefined ? this.open[key] : !!defOpen;
    const wrap = h('div', { class: 'sec' + (open ? ' open' : '') });
    const head = h('button', { class: 'sec-h', 'aria-expanded': open ? 'true' : 'false', 'data-silent': '1' }, icon ? ic(icon) : null, h('span', null, title), summary ? h('span', { class: 'sum' }, summary) : null, ic('chev', 14, 'chev'));
    const body = h('div', { class: 'sec-b', inert: !open, 'aria-hidden': open ? 'false' : 'true' }), inner = h('div', { class: 'inner' });
    body.appendChild(inner);
    let built = false;
    const build = function () { if (!built) { built = true; const c = bodyFn(); if (c) inner.appendChild(c); } };
    if (open) { build(); body.style.height = 'auto'; }
    const self = this;
    head.addEventListener('click', function () {
      const isOpen = wrap.classList.contains('open');
      if (isOpen && body.contains(document.activeElement)) head.focus();
      body.inert = isOpen; body.setAttribute('aria-hidden', isOpen ? 'true' : 'false');
      snd(isOpen ? 'close' : 'open');
      if (isOpen) {
        body.style.height = body.scrollHeight + 'px';
        void body.offsetHeight;
        wrap.classList.remove('open'); body.style.height = '0px';
      } else {
        build();
        wrap.classList.add('open'); body.style.height = '0px';
        void body.offsetHeight;
        body.style.height = inner.scrollHeight + 'px';
        const te = function () { if (wrap.classList.contains('open')) body.style.height = 'auto'; body.removeEventListener('transitionend', te); };
        body.addEventListener('transitionend', te);
      }
      head.setAttribute('aria-expanded', isOpen ? 'false' : 'true');
      self.open[key] = !isOpen;
    });
    wrap.append(head, body);
    return wrap;
  };
  UI.prototype.kv = function (rows) {
    const el = h('div', { class: 'kv' });
    for (const r of rows) { if (!r) continue; el.append(h('div', { class: 'k' }, r[0]), h('div', { class: 'v' + (r[2] ? ' ' + r[2] : '') }, r[1])); }
    return el;
  };
  UI.prototype.stat = function (k, v, d, dcls, icon) {
    const vv = h('div', { class: 'v' }, v), dd = h('div', { class: 'd ' + (dcls || 'muted') }, d || '');
    const el = h('div', { class: 'stat' }, h('div', { class: 'k' }, icon ? ic(icon) : null, k), vv, dd);
    el.setV = function (x, y, c) { vv.textContent = x; if (y !== undefined) dd.textContent = y; if (c !== undefined) dd.className = 'd ' + c; };
    return el;
  };
  UI.prototype.liveText = function (fn, cls) {
    const el = h('span', { class: cls || '' }, '');
    const upd = function () { el.textContent = fn(); };
    upd(); this.live.push(upd);
    return el;
  };
  UI.prototype.callout = function (kind, icon, content) { return h('div', { class: 'callout ' + kind }, ic(icon), h('div', { class: 'ct' }, content)); };

  // ======================== 选择 ========================
  UI.prototype.select = function (sel, noPage) {
    this.selection = sel;
    if (CM.Quick) CM.Quick.show(sel);   // 地图上的快捷操作条（选择工具下的车站、线路）
    if (!sel) { this.highlightLine = null; if (!noPage && this.stack.length && ['station', 'line', 'road', 'zone', 'facility'].indexOf(this.stack[this.stack.length - 1].kind) >= 0) this.back(); return; }
    if (noPage) return;
    const g = this.g();
    const inBuild = this.tools.tool !== 'select';
    if (sel.kind === 'station') this.openPage('station', sel.id, { replaceTop: this.topIs(['station', 'line', 'road', 'zone', 'facility']) || inBuild });
    else if (sel.kind === 'seg') {
      const net = g.draft ? g.draft.net : g.net;
      const s = net.segments[sel.id];
      if (s) this.openPage('line', s.line + '|' + sel.id, { replaceTop: this.topIs(['station', 'line', 'road', 'zone', 'facility']) || inBuild });
    } else if (sel.kind === 'road') this.openPage('road', sel.id, { replaceTop: this.topIs(['station', 'line', 'road', 'zone', 'facility']) });
    else if (sel.kind === 'zone') this.openPage('zone', sel.id, { replaceTop: this.topIs(['station', 'line', 'road', 'zone', 'facility']) });
    else if (sel.kind === 'facility') this.openPage('facility', sel.id, { replaceTop: this.topIs(['station', 'line', 'road', 'zone', 'facility']) });
  };
  // ---------------- 多选（批量修改） ----------------
  UI.prototype.setMulti = function (sel) {
    this.multi = { stations: new Set(sel.stations || []), segs: new Set(sel.segs || []) };
    this.pruneMulti();
    if (this.multi) this.openPage('multi', null, { replaceTop: this.topIs(['station', 'line', 'road', 'zone', 'facility', 'multi']) });
  };
  UI.prototype.toggleMulti = function (kind, id) {
    if (!this.multi) {
      this.multi = { stations: new Set(), segs: new Set() };
      // 已选中的单个对象作为多选的第一项（拆除工具除外：只拆玩家这次点到的）
      const s = this.tools && this.tools.tool === 'demolish' ? null : this.selection;
      if (s && s.kind === 'station') this.multi.stations.add(s.id);
      if (s && s.kind === 'seg') this.multi.segs.add(s.id);
    }
    const set = kind === 'station' ? this.multi.stations : this.multi.segs;
    if (set.has(id)) set.delete(id); else set.add(id);
    snd('soft');
    this.showMulti();
  };
  // 框选：把一批对象加入多选
  UI.prototype.addMulti = function (stations, segs) {
    if (!this.multi) this.multi = { stations: new Set(), segs: new Set() };
    for (const id of stations) this.multi.stations.add(id);
    for (const id of segs) this.multi.segs.add(id);
    snd('soft');
    this.showMulti();
  };
  UI.prototype.showMulti = function () {
    this.pruneMulti();
    if (this.multi) { if (this.topIs(['multi'])) this.renderPage(false); else this.openPage('multi', null, { replaceTop: this.topIs(['station', 'line', 'road', 'zone', 'facility']) }); }
    this.renderToolOpts();
  };
  UI.prototype.pruneMulti = function () {
    const g = this.g(), mu = this.multi; if (!mu || !g) return;
    const net = g.draft ? g.draft.net : g.net;
    mu.stations.forEach(function (id) { if (!net.stations[id]) mu.stations.delete(id); });
    mu.segs.forEach(function (id) { if (!net.segments[id]) mu.segs.delete(id); });
    if (!mu.stations.size && !mu.segs.size) { this.multi = null; if (this.topIs(['multi'])) this.back(); this.renderToolOpts(); }
  };
  UI.prototype.clearMulti = function () { this.multi = null; if (this.topIs(['multi'])) this.back(); this.renderToolOpts(); };
  UI.prototype.topIs = function (kinds) { const t = this.stack[this.stack.length - 1]; return !!t && kinds.indexOf(t.kind) >= 0; };
  UI.prototype.flyTo = function (x, y, z) { this.R.flyTo(x, y, z || Math.max(this.R.cam.zoom, 22)); };

  // ======================== 页面：建设 ========================
  UI.prototype.page_build = function () {
    const g = this.g(), self = this;
    const el = h('div');
    if (!g.draft) {
      el.appendChild(h('div', { class: 'note' }, '还没有建设草案。用底部的「建站」「绘线」等工具开始规划；草案确认前不会扣费，也不会改变正式网络。'));
      return { title: '建设草案', el: el };
    }
    const ev = g.draftEval();
    if (ev.conflicts.length) el.appendChild(this.conflictBlock(ev));
    else if (ev.changed) el.appendChild(this.callout('good', 'good', '没有冲突，可以确认建设。'));
    const nAdd = ev.changes.add.length, nMod = ev.changes.mod.length, nDel = ev.changes.del.length;
    el.appendChild(this.sec('dr-changes', '变更内容', nAdd + ' 新建 · ' + nMod + ' 修改 · ' + nDel + ' 拆除', function () {
      const box = h('div');
      const sect = function (title, arr, cls) { if (!arr.length) return; box.appendChild(h('div', { class: 'small ' + cls, style: { margin: '6px 0 2px', fontWeight: 600 } }, title)); for (const t of arr) box.appendChild(h('div', { class: 'small', style: { padding: '2px 0' } }, '· ' + t)); };
      sect('新建', ev.changes.add, 'good'); sect('修改', ev.changes.mod, 'warn'); sect('拆除', ev.changes.del, 'bad');
      if (!nAdd && !nMod && !nDel) box.appendChild(h('div', { class: 'note' }, '草案暂无变化。'));
      return box;
    }, true, 'tasks'));
    el.appendChild(this.sec('dr-cost', '费用', U.fmtMoney(ev.total), function () {
      const box = h('div');
      for (const it of ev.items) box.appendChild(h('div', { class: 'chg small' }, h('span', null, it.label), h('span', { class: 'num' }, U.fmtMoney(it.amount))));
      if (!ev.items.length) box.appendChild(h('div', { class: 'note' }, '本次修改不产生费用（拆除与小范围调整免费）。'));
      const nDem = self.R.demolitionBoxes().boxes.length;
      if (nDem) box.appendChild(h('div', { class: 'callout warn', style: { marginTop: '6px' } }, '将拆除房屋 ' + nDem + ' 栋，地图上以红色标出。'));
      box.appendChild(h('div', { class: 'note', style: { marginTop: '6px' } }, g.econ.isFree() ? '自由建造：资金不限。' : '当前资金 ' + U.fmtMoney(g.econ.funds) + '。'));
      return box;
    }, false, 'coin'));
    if (ev.warnings.length) {
      el.appendChild(this.sec('dr-warn', '提示', ev.warnings.length + ' 条', function () {
        const box = h('div');
        for (const w of ev.warnings) box.appendChild(h('div', { class: 'wn-card', onclick: function () { self.flyTo(w.x, w.y); } }, ic('warn'), h('span', null, w.msg)));
        return box;
      }, false, 'warn'));
    }
    this.predBox = this.predictionBlock();
    el.appendChild(this.predBox);
    return { title: '建设草案', el: el };
  };
  // 车站规模卡片：容量、编组上限、建设费、日运营费。
  // opts：{ type, cur（当前选择）, base（既有车站的已建规模，新建时为空）, rebuild（建设方式已改，按改建计费）, onPick }
  UI.prototype.sizeCards = function (opts) {
    const g = this.g(), y = g.clock.y, mc = CFG.metro, oi = g.econ.opsIndex(y), ord = ['S', 'M', 'L'];
    const wrap = h('div');
    const cards = h('div', { class: 'size-cards' });
    const costOf = function (sz) { return M.stationCost(opts.type, sz, y); };
    const upCost = function (sz) { return (costOf(sz) - costOf(opts.base)) * CFG.cost.upgradeFactor; };
    for (const sz of ord) {
      let line;
      if (!opts.base || opts.rebuild) line = (opts.rebuild ? '改建 ' : '建设 ') + U.fmtMoney(costOf(sz));
      else {
        const d = ord.indexOf(sz) - ord.indexOf(opts.base);
        line = d === 0 ? '已建规模' : (d > 0 ? '升级 ' + U.fmtMoney(upCost(sz)) : '缩减 · 不退款');
      }
      cards.appendChild(h('button', { class: 'size-card' + (opts.cur === sz ? ' on' : ''), 'aria-pressed': opts.cur === sz ? 'true' : 'false', onclick: function () { if (opts.cur !== sz) opts.onPick(sz); } },
        h('div', { class: 'sc-h' }, h('b', null, mc.sizeName[sz]), opts.base === sz ? h('span', { class: 'sc-tag' }, '当前') : null),
        h('div', { class: 'sc-v' }, U.fmtInt(mc.stationCap[sz]), h('small', null, ' 人次/时')),
        h('div', { class: 'sc-k' }, '编组上限 ' + mc.carsBySize[sz] + ' 节'),
        h('div', { class: 'sc-k' }, '运营 ' + U.fmtMoney(CFG.ops.stationDaily[sz] * oi) + '/日'),
        h('div', { class: 'sc-cost' }, line)));
    }
    wrap.appendChild(cards);
    // 升级前后对比与本次费用
    if (opts.base && opts.cur !== opts.base && !opts.rebuild) {
      const a = opts.base, b = opts.cur, up = ord.indexOf(b) > ord.indexOf(a);
      const dOps = (CFG.ops.stationDaily[b] - CFG.ops.stationDaily[a]) * oi;
      wrap.appendChild(h('div', { class: 'size-diff ' + (up ? 'up' : 'down') },
        h('div', null, h('b', null, mc.sizeName[a] + ' → ' + mc.sizeName[b]), up ? '，本次升级费用 ' + U.fmtMoney(upCost(b)) : '，缩减不退还建设费'),
        h('div', { class: 'tiny' }, '容量 ' + U.fmtInt(mc.stationCap[a]) + ' → ' + U.fmtInt(mc.stationCap[b]) + ' 人次/时 · 编组上限 ' + mc.carsBySize[a] + ' → ' + mc.carsBySize[b] + ' 节 · 运营费 ' + (dOps >= 0 ? '+' : '−') + U.fmtMoney(Math.abs(dOps)) + '/日')));
    }
    return wrap;
  };
  // 冲突列表：编号与地图图钉一致，说明原因、怎么解决，并提供一键修复
  UI.prototype.conflictBlock = function (ev) {
    const self = this;
    const wrap = h('div');
    wrap.appendChild(this.callout('bad', 'error', h('span', null, h('b', null, '有 ' + ev.conflicts.length + ' 处冲突，需解决后才能确认建设。'), h('br'), '地图上的红色编号图钉标出了每处冲突的位置，相关轨道或车站以红色高亮。')));
    const list = h('div', { class: 'cf-list' });
    for (const c of ev.conflicts) {
      const fixes = h('div', { class: 'cf-fix' }), gd = this.tools && this.tools.guideFor ? this.tools.guideFor(c) : null;
      fixes.appendChild(h('button', { class: 'btn sm', onclick: function (e) { e.stopPropagation(); self.hoverConflict = c.n; self.flyTo(c.x, c.y, Math.max(self.R.cam.zoom, 22)); } }, ic('locate'), '定位'));
      // 试算得到的具体调整（v2.3）：一键按建议移动转弯点或车站
      // 支线把既有线路的站台方向拉偏时（v2.4），「保持原站台方向」优先于移动受影响区段的转弯点
      const keepDir = (c.fixes || []).some(function (f) { return f.op === 'platDir'; });
      if (gd && gd.fix) fixes.appendChild(h('button', { class: 'btn sm' + (keepDir ? '' : ' primary'), onclick: function (e) { e.stopPropagation(); self.applyFix(gd.fix); } }, ic('sparkle', 14), gd.fix.label));
      for (const f of (c.fixes || [])) fixes.appendChild(h('button', { class: 'btn sm' + (f.op === 'platDir' || (!(gd && gd.fix) && (f.op === 'segType' || f.op === 'splitBranch' || f.op === 'normalize' || f.op === 'removeBend')) ? ' primary' : ''), onclick: function (e) { e.stopPropagation(); self.applyFix(f); } }, f.label));
      const card = h('div', { class: 'cf-card' + (self.hoverConflict === c.n ? ' on' : ''),
        onmouseenter: function () { self.hoverConflict = c.n; },
        onmouseleave: function () { if (self.hoverConflict === c.n) self.hoverConflict = null; },
        onclick: function () { self.hoverConflict = c.n; self.flyTo(c.x, c.y, Math.max(self.R.cam.zoom, 20)); } },
        h('div', { class: 'cf-top' }, h('span', { class: 'cf-num' }, String(c.n)), h('div', { class: 'cf-msg' }, c.msg)),
        gd && gd.text ? h('div', { class: 'cf-guide' }, ic('target', 14), h('span', null, gd.text)) : null,
        c.how ? h('div', { class: 'cf-how' }, h('b', null, '怎么解决：'), c.how) : null,
        fixes);
      list.appendChild(card);
    }
    wrap.appendChild(list);
    return wrap;
  };

  // ======================== 菜单与全屏界面 ========================
  UI.prototype.closeMenu = function () {
    if (this._menuOutside) { window.removeEventListener('pointerdown', this._menuOutside, true); this._menuOutside = null; }
    if (this.dropdown) { this.dropdown.remove(); this.dropdown = null; }
  };
  UI.prototype.showMenu = function (anchor) {
    this.toggleLayerPanel(false); this.closeTimeOptions(); this.toggleMetricsMore(false);
    if (this.tools) { this.tools.keys.clear(); this.tools.keyMods = {}; }
    const self = this;
    if (this.dropdown) { this.closeMenu(); return; }
    const item = function (icon, label, fn, key) { return h('button', { onclick: function () { self.closeMenu(); fn(); } }, ic(icon), h('span', { class: 'grow' }, label), key ? h('kbd', null, key) : null); };
    const narrowItem = function (icon, label, fn) { const b = item(icon, label, fn); b.classList.add('dd-narrow'); return b; };
    const g = this.g();
    const dd = h('div', { class: 'dropdown' },
      h('div', { class: 'dd-head' }, h('img', { src: 'img/logo-white.png', alt: '' }), h('div', null, h('b', null, g ? g.name : '城市与地铁'), h('div', { class: 'tiny muted' }, g ? (g.econ.isFree() ? '自由建造' : '经营挑战') + ' · ' + g.clock.y + '年' + g.clock.m + '月' : ''), g ? h('div', { class: 'tiny ' + (self.save.state === 'error' ? 'bad' : (self.isSaved() ? 'good' : 'muted')) }, self.saveStatusText()) : null)),
      item('save', '保存进度', function () { self.manualSave(); }),
      item('folder', '读取存档', function () { self.showSaveManager(true); }),
      h('hr'),
      g && CM.DATA.briefing ? item('briefing', '开局简报', function () { self.showBriefing(); }) : null,
      g ? item('book', '城市纪事', function () { self.openStats('milestones'); }) : null,
      g ? item('book', '新手指南', function () { self.openPage('guide', null, { root: true }); }) : null,
      item('help', '操作说明', function () { self.openPage('help', null, { root: true }); }),
      item('megaphone', '更新公告', function () { self.showNews(); }),
      g ? item(CM.Settings.get('immersive') ? 'eye' : 'eyeOff', CM.Settings.get('immersive') ? '显示界面' : '沉浸模式', function () { self.toggleImmersive(); }, CM.Keys.hint('ui.hideUI')) : null,
      // 窄屏（手机）顶栏收起了深浅模式与设置按钮，在菜单里提供
      narrowItem(document.documentElement.dataset.theme === 'dark' ? 'sun' : 'moon', document.documentElement.dataset.theme === 'dark' ? '浅色模式' : '深色模式', function () { self.toggleTheme(); }),
      narrowItem('gear', '设置', function () { self.showSettings(); }),
      h('hr'),
      item('home', '返回主菜单', function () { self.backToMenu(); }));
    document.body.appendChild(dd);
    this.dropdown = dd;
    // 矮窗口内保留菜单自身的滚动区域；窗口或界面缩放后重新跟随菜单按钮定位。
    dd._place = function () {
      const r = anchor.getBoundingClientRect(), v = self.viewport();
      const top = Math.max(v.top + 8, Math.min(r.bottom + 8, v.top + (v.bottom - v.top) / 2));
      dd.style.top = top + 'px';
      dd.style.maxWidth = Math.max(0, v.right - v.left - 16) + 'px';
      dd.style.maxHeight = Math.max(0, v.bottom - top - 8) + 'px';
      const x = r.left < v.x + v.w / 2 ? r.left : r.right - dd.offsetWidth;
      dd.style.left = Math.max(v.left + 8, Math.min(x, v.right - dd.offsetWidth - 8)) + 'px';
    };
    dd._place();
    this._menuOutside = function (e) { if (self.dropdown && !self.dropdown.contains(e.target) && !anchor.contains(e.target)) self.closeMenu(); };
    window.addEventListener('pointerdown', this._menuOutside, true);
  };

  // ======================== 收藏与搜索 ========================
  // 收藏按 id 引用实际站点或线路（改名自动同步）；同时记住最后的名称，用于说明已拆除的收藏
  UI.prototype.isFav = function (kind, id) { const g = this.g(); return !!g && g.favs[kind].indexOf(id) >= 0; };
  UI.prototype.toggleFav = function (kind, id) {
    const g = this.g(); if (!g) return;
    const a = g.favs[kind], i = a.indexOf(id);
    if (i >= 0) a.splice(i, 1);
    else {
      a.push(id);
      const net = g.draft ? g.draft.net : g.net, o = kind === 'stations' ? net.stations[id] : net.lines[id];
      g.favs.names = g.favs.names || {}; if (o) g.favs.names[id] = o.name;
    }
    g.touch(); this.markUnsaved(); snd('soft');
  };
  UI.prototype.favBtn = function (kind, id) {
    const self = this;
    const b = h('button', { class: 'iconbtn fav', onclick: function () { self.toggleFav(kind, id); upd(); } });
    const upd = function () { const on = self.isFav(kind, id); b.classList.toggle('on', on); b.innerHTML = ''; b.appendChild(ic(on ? 'starOn' : 'star')); b.setAttribute('data-tip', on ? '取消收藏' : '收藏（在搜索中置顶）'); };
    upd();
    return b;
  };
  // 定位一组车站（线路）：飞到其范围
  UI.prototype.flyToStations = function (pts) {
    if (!pts.length) return;
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (const p of pts) { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); }
    const z = U.clamp(Math.min(this.R.w * 0.55 / (x1 - x0 + 2), this.R.h * 0.55 / (y1 - y0 + 2)), 8, 30);
    this.R.flyTo((x0 + x1) / 2, (y0 + y1) / 2, z);
  };
  // ---------------- 在地图上定位并高亮（片区、区域、道路、地点） ----------------
  // 地图上未被遮挡的区域（除去左侧图层栏、右侧详情面板、顶栏与底部工具栏）
  UI.prototype.mapViewport = function () {
    let x0 = 0, x1 = this.R.w, y0 = 0, y1 = this.R.h;
    const box = function (id) { const el = document.getElementById(id); return el && !el.classList.contains('hidden') && el.offsetWidth > 0 ? el.getBoundingClientRect() : null; };
    const rp = box('rightPanel'), dk = box('dock'), tp = box('hudTop'), tb = box('toolbar');
    if (rp && rp.left > this.R.w * 0.3) x1 = rp.left - 8;
    if (dk) x0 = dk.right + 8;
    if (tp) y0 = tp.bottom + 8;
    if (tb && tb.top > this.R.h * 0.5) y1 = tb.top - 8;
    const bs = box('buildStack'), co = box('coach');
    if (bs && bs.top > this.R.h * 0.4) y1 = Math.min(y1, bs.top - 8);
    if (co && co.left < this.R.w * 0.3 && co.right < this.R.w * 0.45) x0 = Math.max(x0, co.right + 8);
    return { x0: x0, y0: y0, x1: x1, y1: y1 };
  };
  // 飞到一个范围并让它落在可见区域中央（略偏下，给上方的名称标签留位置）
  UI.prototype.fitBox = function (x0, y0, x1, y1, maxZ) {
    const R = this.R, M = R.M, vp = this.mapViewport();
    let sx0 = 1e9, sx1 = -1e9, sy0 = 1e9, sy1 = -1e9;
    for (const c of [[x0, y0], [x1, y0], [x0, y1], [x1, y1]]) {
      const sx = M[0] * c[0] + M[1] * c[1], sy = M[2] * c[0] + M[3] * c[1];
      sx0 = Math.min(sx0, sx); sx1 = Math.max(sx1, sx); sy0 = Math.min(sy0, sy); sy1 = Math.max(sy1, sy);
    }
    const z = U.clamp(Math.min((vp.x1 - vp.x0) * 0.7 / (sx1 - sx0 + 1), (vp.y1 - vp.y0 - 50) * 0.75 / (sy1 - sy0 + 1)), 7, maxZ || 30);
    const dx = R.w / 2 - (vp.x0 + vp.x1) / 2, dy = R.h / 2 - ((vp.y0 + vp.y1) / 2 + 18), det = M[0] * M[3] - M[1] * M[2] || 1;
    R.flyTo((x0 + x1) / 2 + (M[3] * dx - M[1] * dy) / det / z, (y0 + y1) / 2 + (M[0] * dy - M[2] * dx) / det / z, z);
  };
  UI.prototype.locateZone = function (z, label) {
    const g = this.g(), m = g.model, Z = CFG.ZONE, zi = z % m.ZW, zj = (z / m.ZW) | 0;
    const x0 = zi * Z, y0 = zj * Z;
    this.R.setHighlight({ kind: 'rect', x0: x0, y0: y0, x1: x0 + Z, y1: y0 + Z, lx: x0 + Z / 2, ly: y0, label: label || g.zoneName(z) });
    this.fitBox(x0 - 2, y0 - 2, x0 + Z + 2, y0 + Z + 2, 26);
  };
  UI.prototype.locatePoint = function (x, y, label, r, pad) {
    r = r || 1.2; pad = pad || 2;
    this.R.setHighlight({ kind: 'circle', x: x, y: y, r: r, lx: x, ly: y - r, label: label });
    this.fitBox(x - r - pad, y - r - pad, x + r + pad, y + r + pad, 26);
  };
  UI.prototype.locateRegion = function (k) {
    const g = this.g(), rg = g.city.regions[k]; if (!rg || !rg.bbox) return;
    const b = rg.bbox;
    this.R.setHighlight({ kind: 'region', region: k, lx: rg.cx, ly: rg.cy, label: rg.name.replace(/（.*）/, '') });
    this.fitBox(b[0], b[1], b[2], b[3], 22);
  };
  UI.prototype.locateRoad = function (name) {
    const city = this.g().city, ways = [];
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    city.roadGroups.forEach(function (gr) { if (gr.name !== name) return; for (const p of gr.ways) ways.push(p); x0 = Math.min(x0, gr.bbox[0]); y0 = Math.min(y0, gr.bbox[1]); x1 = Math.max(x1, gr.bbox[2]); y1 = Math.max(y1, gr.bbox[3]); });
    if (!ways.length) return;
    const p = ways[0], m = (p.length / 4 | 0) * 2;
    this.R.setHighlight({ kind: 'road', ways: ways, lx: p[m], ly: p[m + 1], label: name });
    this.fitBox(x0, y0, x1, y1, 24);
  };
  UI.prototype.openSearch = function () {
    this.toggleLayerPanel(false); this.closeTimeOptions(); this.toggleMetricsMore(false);
    const g = this.g(); if (!g) return;
    if (this.searchEl) { this.closeSearch(); return; }
    if (this.dropdown) this.closeMenu();
    const self = this, favs = g.favs, city = g.city, D = CM.DATA;
    favs.names = favs.names || {};
    const input = h('input', { type: 'search', placeholder: '搜索车站、线路、道路、区域或地名', 'aria-label': '搜索车站、线路、道路、区域或地名', autocomplete: 'off' });
    const list = h('div', { class: 'srch-list', role: 'listbox' });
    const pop = h('div', { class: 'search-pop' }, h('div', { class: 'srch-in' }, ic('search'), input, h('kbd', null, 'Esc'), h('button', { class: 'iconbtn', 'aria-label': '关闭搜索', onclick: function () { self.closeSearch(); } }, ic('close'))), list);
    pop._place = function () {
      const v = self.viewport(), r = self.hbtns.search.getBoundingClientRect();
      // 键盘弹出后至少留出一行结果；高度不足时搜索框可上移。
      const top = Math.max(v.top + 8, Math.min(r.bottom + 8, v.bottom - 140));
      pop.style.top = top + 'px';
      pop.style.maxHeight = Math.max(0, v.bottom - top - 8) + 'px';
      pop.style.maxWidth = Math.max(0, v.right - v.left - 16) + 'px';
      pop.style.left = Math.max(v.left + 8, Math.min(r.right - pop.offsetWidth + 40, v.right - pop.offsetWidth - 8)) + 'px';
    };
    let items = [], cur = 0;
    // 地理条目（区域、城区、地标、道路、地名）：打开时生成一次
    const RANK = { lines: 0, stations: 1, region: 2, district: 2, landmark: 3, road: 4, place: 5 };
    const geo = [];
    city.regions.forEach(function (rg, k) {
      if (!rg.name || !rg.cells || !rg.bbox) return;
      geo.push({ kind: 'region', id: k, name: rg.name, sub: '区域 · ' + (rg.scenic ? '风景区' : city.regionOpen[k] ? '已开放' : '尚未开放（' + U.regionLock(rg) + '）'), icon: 'map' });
    });
    for (const d of city.districtLabels || []) geo.push({ kind: 'district', name: d[0], sub: '城区', x: d[1], y: d[2], icon: 'map' });
    D.landmarks.forEach(function (lm, k) { geo.push({ kind: 'landmark', name: lm.name, sub: '地标' + (city.landmarkOn[k] ? '' : ' · 尚未建成（' + lm.year + ' 年）'), x: lm.x, y: lm.y, icon: 'building' }); });
    const roads = new Map(), CLS = ['', '支路', '次干道', '主干道', '快速路'];
    city.roadGroups.forEach(function (gr, k) {
      if (!gr.name || !city.roadsBuilt[k]) return;
      const e = roads.get(gr.name);
      if (!e) roads.set(gr.name, { kind: 'road', name: gr.name, cls: gr.cls, icon: 'car' }); else e.cls = Math.max(e.cls, gr.cls);
    });
    roads.forEach(function (e) { e.sub = '道路 · ' + (CLS[e.cls] || '道路'); geo.push(e); });
    const seen = new Set();
    for (const p of D.places) if (!seen.has(p[0])) { seen.add(p[0]); geo.push({ kind: 'place', name: p[0], sub: '地名', x: p[1], y: p[2], icon: 'locate' }); }
    const entries = function () {
      const net = g.draft ? g.draft.net : g.net, out = [];
      for (const id in net.stations) {
        const s = net.stations[id], ls = M.stationLines(net, id).map(function (l) { return net.lines[l]; }).filter(Boolean);
        out.push({ kind: 'stations', id: id, name: s.name, sub: ls.length ? ls.map(function (l) { return l.name; }).join('、') + (ls.length > 1 ? ' · 换乘站' : '') : '未接入线路', color: ls[0] ? AX.line(ls[0]) : null, x: s.x, y: s.y, st: true });
        if (favs.stations.indexOf(id) >= 0) favs.names[id] = s.name;
      }
      for (const id in net.lines) {
        const L = net.lines[id], tp = M.lineTopo(net, id);
        out.push({ kind: 'lines', id: id, name: L.name, sub: M.TOPO_NAME[tp.topo] + ' · ' + tp.stations.length + ' 站', color: AX.line(L), line: true, stations: tp.stations.map(function (sid) { return net.stations[sid]; }).filter(Boolean) });
        if (favs.lines.indexOf(id) >= 0) favs.names[id] = L.name;
      }
      return out;
    };
    const open = function (it) {
      if (it.gone) return;
      self.closeSearch();
      if (it.st) { self.select({ kind: 'station', id: it.id }); self.flyTo(it.x, it.y, Math.max(self.R.cam.zoom, 24)); }
      else if (it.line) { self.openPage('line', it.id, { replaceTop: self.topIs(['station', 'line', 'road', 'zone', 'facility']) }); self.flyToStations(it.stations); }
      else if (it.kind === 'region') self.locateRegion(it.id);
      else if (it.kind === 'road') self.locateRoad(it.name);
      else if (it.kind === 'district') self.locatePoint(it.x, it.y, it.name, 4, 4);
      else self.locatePoint(it.x, it.y, it.name, it.kind === 'landmark' ? 0.8 : 1.2);
    };
    const canFav = function (it) { return it.kind === 'stations' || it.kind === 'lines'; };
    const row = function (it, k) {
      const star = canFav(it) ? h('button', { class: 'iconbtn fav' + (self.isFav(it.kind, it.id) ? ' on' : ''), 'data-tip': self.isFav(it.kind, it.id) ? '取消收藏' : '收藏', onclick: function (e) { e.stopPropagation(); self.toggleFav(it.kind, it.id); render(); input.focus(); } }, ic(self.isFav(it.kind, it.id) ? 'starOn' : 'star')) : null;
      const mark0 = it.line ? h('span', { class: 'swatch', style: { background: it.color } }) : it.st ? h('span', { class: 'st-dot', style: { borderColor: it.color || 'var(--muted)' } }) : h('span', { class: 'srch-ic' }, ic(it.icon));
      return h('div', { class: 'srch-item' + (k === cur ? ' on' : '') + (it.gone ? ' gone' : ''), role: 'option', onclick: function () { open(it); }, onmouseenter: function () { cur = k; mark(); } },
        mark0, h('div', { class: 'grow' }, h('div', { class: 'srch-name' }, it.name), h('div', { class: 'tiny muted' }, it.sub)), star);
    };
    const mark = function () { Array.prototype.forEach.call(list.querySelectorAll('.srch-item'), function (el, k) { el.classList.toggle('on', k === cur); }); };
    const render = function () {
      const q = input.value.trim().toLowerCase(), all = M.withSegIndex([g.net, g.draft && g.draft.net], entries);
      list.innerHTML = ''; items = []; cur = 0;
      if (!q) {
        const fav = [];
        for (const kind of ['lines', 'stations']) for (const id of favs[kind]) {
          const e = all.find(function (x) { return x.kind === kind && x.id === id; });
          fav.push(e || { kind: kind, id: id, name: favs.names[id] || (kind === 'lines' ? '线路' : '车站'), sub: '已拆除，无法定位', gone: true });
        }
        if (fav.length) { list.appendChild(h('div', { class: 'srch-h' }, '收藏')); fav.forEach(function (it) { items.push(it); list.appendChild(row(it, items.length - 1)); }); }
        else list.appendChild(h('div', { class: 'note', style: { padding: '8px 10px' } }, '输入名称搜索车站、线路、道路、区域、地标或地名，选中后在地图上定位并高亮。在车站或线路详情中点击 ☆ 可收藏，收藏会显示在这里。'));
        const lines = all.filter(function (x) { return x.line && !self.isFav('lines', x.id); });
        if (lines.length) { list.appendChild(h('div', { class: 'srch-h' }, '全部线路')); lines.forEach(function (it) { items.push(it); list.appendChild(row(it, items.length - 1)); }); }
        return;
      }
      const searchable = function (x) { return CM.I18n ? CM.I18n.search(x.name) : x.name.toLowerCase(); };
      const hits = all.concat(geo).filter(function (x) { return searchable(x).indexOf(q) >= 0; });
      const score = function (x) { const n = searchable(x); return (canFav(x) && self.isFav(x.kind, x.id) ? 0 : 1000) + (x.name.toLowerCase() === q ? 0 : n.indexOf(q) === 0 ? 100 : 200) + RANK[x.kind] * 10; };
      hits.sort(function (a, b) { return score(a) - score(b) || a.name.length - b.name.length; });
      if (!hits.length) { list.appendChild(h('div', { class: 'note', style: { padding: '8px 10px' } }, '没有名称包含「' + input.value.trim() + '」的车站、线路、道路、区域或地名。')); return; }
      hits.slice(0, 50).forEach(function (it) { items.push(it); list.appendChild(row(it, items.length - 1)); });
    };
    input.addEventListener('input', render);
    input.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); if (items.length) { cur = (cur + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length; mark(); const el = list.querySelectorAll('.srch-item')[cur]; if (el) el.scrollIntoView({ block: 'nearest' }); } }
      else if (e.key === 'Enter') { e.preventDefault(); if (items[cur]) open(items[cur]); }
      else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); self.closeSearch(); }
    });
    document.body.appendChild(pop);
    this.searchEl = pop;
    pop._place();
    if (this.tools) { this.tools.keys.clear(); this.tools.keyMods = {}; }
    render();
    setTimeout(function () { if (self.searchEl === pop) input.focus(); }, 0);
    this._searchClose = function (e) { if (self.searchEl && !self.searchEl.contains(e.target) && !self.hbtns.search.contains(e.target)) self.closeSearch(); };
    const outside = this._searchClose;
    setTimeout(function () { if (self.searchEl === pop && self._searchClose === outside) window.addEventListener('pointerdown', outside, true); }, 0);
  };
  UI.prototype.closeSearch = function () {
    if (this.searchEl) { this.searchEl.remove(); this.searchEl = null; }
    if (this._searchClose) { window.removeEventListener('pointerdown', this._searchClose, true); this._searchClose = null; }
  };
  UI.prototype.openScreen = function (card, onEsc, cls, tr) {
    this.toggleLayerPanel(false);
    if (this.tools) { this.tools.keys.clear(); this.tools.keyMods = {}; }
    this.closeMenu(); this.closeSearch(); this.closeLinePicker();
    if (this._keyCap) this._keyCap();
    this.toggleMetricsMore(false);
    this.closeTimeOptions();
    if (CM.Quick) CM.Quick.hide();
    if (this.tools) this.tools.cancelDrag();
    // 载入背景（#stagebg）常驻在界面层里，切换界面时保留
    const sc = this.screen, bg = this._stageBg, kids = Array.from(sc.childNodes).filter(function (n) { return n !== bg; });
    const live = tr && sc.className.indexOf('hidden') < 0 && kids.length && !CM.Settings.reducedMotion();
    if (live) {
      const old = document.createElement('div'), cs = getComputedStyle(sc);
      old.className = 'scr-out scr-' + tr; old.style.placeItems = cs.placeItems; old.setAttribute('aria-hidden', 'true');
      for (const n of kids) { if (n.classList && n.classList.contains('scr-out')) n.remove(); else old.appendChild(n); }
      sc.className = (cls || '') + ' scr-in-' + tr;
      sc.appendChild(old); sc.appendChild(card);
      clearTimeout(this._scrT);
      // 只移走旧界面；scr-in-* 类保留到下一次换界面（v2.3）：以前过渡结束时摘掉它，标题与菜单的入场动画名随之改变、
      // 浏览器会把动画从头再播一遍，返回主菜单时整块内容先消失再浮现（闪一下）
      this._scrT = setTimeout(function () { old.remove(); }, 420);
    } else {
      for (const n of kids) n.remove();
      sc.className = cls || '';
      sc.appendChild(card);
    }
    if (!/\bld-screen\b/.test(cls || '')) { this._ld = null; this.stageBg(null); }
    this.screenEsc = onEsc || null;
  };
  UI.prototype.closeScreen = function () { if (this._keyCap) this._keyCap(); this._ld = null; this.screen.className = 'hidden'; this.screenEsc = null; this.screenRefresh = null; this.stageBg(null); };
  // 载入背景（v2.2）：所选城市的地图画面铺满全屏（模糊、提亮），载入卡片浮在上面；from 为选择地图里地图画面的位置，
  // 给出时由该处放大到全屏，否则直接淡入。src 为 null 时淡出
  UI.prototype.stageBg = function (src, from) {
    let bg = this._stageBg;
    if (!src) { if (bg) bg.classList.remove('on'); return; }
    if (!bg) bg = this._stageBg = h('div', { id: 'stagebg', 'aria-hidden': 'true' }, h('div', { class: 'sb-frame' }, h('img', { alt: '' })));
    if (bg.parentNode !== this.screen) this.screen.insertBefore(bg, this.screen.firstChild);   // 在界面层最下方：盖住背景渐变，位于界面内容之下
    const fr = bg.firstChild, img = fr.firstChild, vw = innerWidth, vh = innerHeight;
    img.src = src;
    fr.style.transition = 'none';
    if (from && !CM.Settings.reducedMotion()) {
      // 均匀缩放的全屏画面盖住原位置，再用裁切只露出原位置，随后两者同时过渡到全屏
      const s = Math.max(from.width / vw, from.height / vh), tx = from.left + from.width / 2 - vw * s / 2, ty = from.top + from.height / 2 - vh * s / 2;
      fr.style.transform = 'translate(' + tx + 'px,' + ty + 'px) scale(' + s + ')';
      const l = (from.left - tx) / s, t = (from.top - ty) / s, r = vw - l - from.width / s, b = vh - t - from.height / s;
      fr.style.clipPath = 'inset(' + t + 'px ' + r + 'px ' + b + 'px ' + l + 'px round ' + (18 / s) + 'px)';
      bg.classList.add('on', 'zoom');
      this._zoomUntil = performance.now() + 560;   // 载入的重活在动效结束后开始（main.js runLoad）
      void fr.offsetWidth;
      fr.style.transition = '';
      fr.style.transform = 'none'; fr.style.clipPath = 'inset(0 round 0)';
    } else {
      fr.style.transform = 'none'; fr.style.clipPath = 'none';
      bg.classList.remove('zoom');
      void fr.offsetWidth; fr.style.transition = '';
      bg.classList.add('on');
    }
  };
  UI.prototype.cardHead = function (icon, badge, title) { return h('div', { class: 'card-head' }, h('span', { class: 'badge ' + badge }, ic(icon)), h('h2', null, title)); };
  UI.prototype.confirm = function (title, text, okLabel, onOk, danger, icon) {
    const self = this;
    const prevCls = this.screen.className;
    const prev = prevCls.indexOf('hidden') >= 0 ? null : Array.from(this.screen.childNodes);
    const prevEsc = this.screenEsc;
    // 取消时原样放回上一个界面（不重播入场动画，避免闪动）
    const restore = function () { if (prev) { self.screen.innerHTML = ''; self.screen.className = prevCls + ' noanim'; prev.forEach(function (n) { self.screen.appendChild(n); }); self.screenEsc = prevEsc; } else self.closeScreen(); };
    const card = h('div', { class: 'card' }, this.cardHead(icon || (danger ? 'warn' : 'help'), danger ? 'b-red' : 'b-blue', title), h('div', { class: 'note', style: { fontSize: '13px' } }, text),
      h('div', { class: 'modal-actions' }, h('button', { class: 'btn', onclick: restore }, '取消'), h('button', { class: 'btn ' + (danger ? 'danger fill' : 'primary'), onclick: function () { restore(); onOk(); } }, okLabel)));
    this.openScreen(card, restore);
  };
  // 开始界面、选择地图、开局简报与更新公告见 screens.js
  // 退出：网页无法强制关闭自己打开的标签页时，给出提示
  UI.prototype.quitGame = function () {
    const self = this;
    this.confirm('退出游戏？', '进度已自动保存在本浏览器中，下次打开 index.html 可点击「继续游戏」。', '退出', function () {
      try { window.close(); } catch (e) { /* ignore */ }
      setTimeout(function () { if (!window.closed) self.openScreen(h('div', { class: 'card', style: { width: 'min(420px, calc(100vw - 32px))', textAlign: 'center' } }, h('img', { class: 'logo-ink', src: 'img/logo-navy.png', alt: '', style: { width: '72px', margin: '6px auto 12px', display: 'block' } }), h('h2', { style: { justifyContent: 'center' } }, '感谢游玩'), h('div', { class: 'note' }, '浏览器不允许网页自行关闭此标签页，请直接关闭它。'), h('div', { class: 'modal-actions', style: { justifyContent: 'center' } }, h('button', { class: 'btn primary', onclick: function () { self.showStart(); } }, '返回主菜单'))), function () { self.showStart(); }); }, 120);
    }, false, 'power');
  };
  // ======================== 设置 ========================
  // 设置：单页，只保留常用项；控件就地更新（不整页重绘），主题与界面大小平滑过渡
  UI.settingsExtra = { display: [], data: [] };
  const SET_TABS = [['display', 'view2d', '画面'], ['audio', 'sound', '声音'], ['game', 'metro', '游戏'], ['keys', 'keyboard', '键位'], ['data', 'save', '存档'], ['about', 'info', '关于']];
  UI.prototype.showSettings = function (tab) {
    const self = this, S = CM.Settings;
    const inGame = !!this.g();
    const back = function () { if (self._keyCap) self._keyCap(); if (inGame) self.closeScreen(); else self.showStart(); };
    let cur = SET_TABS.some(function (t) { return t[0] === tab; }) ? tab : (this._setTab || 'display');
    const row = function (icon, title, ctl, desc) { return h('div', { class: 'set-row' }, h('span', { class: 'set-ico' }, ic(icon)), h('div', { class: 'grow' }, h('div', { class: 'set-t' }, title), desc ? h('div', { class: 'set-d' }, desc) : null), ctl); };
    const toggle = function (key, onChange) {
      const b = h('button', { class: 'switch' + (S.get(key) ? ' on' : ''), role: 'switch', 'aria-checked': S.get(key) ? 'true' : 'false', 'data-silent': '1', onclick: function () {
        S.set(key, !S.get(key)); b.classList.toggle('on', !!S.get(key)); b.setAttribute('aria-checked', S.get(key) ? 'true' : 'false'); snd('toggle'); if (onChange) onChange();
      } }, h('i'));
      return b;
    };
    const seg = function (key, opts, after) {
      const c = h('div', { class: 'seg-ctl' });
      const btns = opts.map(function (o) {
        return h('button', { class: S.get(key) === o[0] ? 'on' : '', 'data-silent': '1', onclick: function () {
          if (S.get(key) === o[0]) return;
          if (key === 'uiScale' && !S.reducedMotion()) document.getElementById('app').animate([{ opacity: 0.25 }, { opacity: 1 }], { duration: 380, easing: 'ease-out' });
          S.set(key, o[0]); snd('soft');
          btns.forEach(function (b, k) { b.classList.toggle('on', opts[k][0] === o[0]); });
          if (after) after();
        } }, o[2] ? ic(o[2]) : null, o[1]);
      });
      btns.forEach(function (b) { c.appendChild(b); });
      return c;
    };
    // 三路音量：总音量（含界面音效）、列车音效、城市环境音；关闭音效时一并变灰
    const volRows = [];
    const volRow = function (key, icon, title, desc) {
      const val = h('span', { class: 'set-val' }, Math.round(S.get(key) * 100) + '%');
      const input = h('input', { type: 'range', min: 0, max: 1, step: 0.05, value: S.get(key), 'aria-label': title, oninput: function (e) { S.set(key, +e.target.value); val.textContent = Math.round(e.target.value * 100) + '%'; }, onchange: function () { snd('good'); } });
      const r = row(icon, title, h('div', { class: 'set-slider' }, input, val), desc);
      r.classList.add('vol-row'); if (!S.get('sound')) r.classList.add('off');
      volRows.push(r);
      return r;
    };
    const group = function (title) { return h('div', { class: 'set-group' }, title); };
    const extra = function (key) { return (UI.settingsExtra[key] || []).map(function (f) { try { return f(); } catch (e) { console.error(e); return null; } }).filter(Boolean); };
    const pages = {
      display: function () {
        return [group('显示')].concat(extra('display'), [
          row('label', '界面语言', seg('language', [['zh-CN', '简体中文'], ['zh-TW', '繁体中文'], ['en', 'English']]), '切换后立即生效，下次启动保留此选择'),
          row('sun', '主题', seg('theme', [['light', '浅色', 'sun'], ['dark', '深色', 'moon'], ['auto', '跟随系统']], function () { self.renderThemeBtns(); })),
          row('expand', '界面大小', seg('uiScale', [[0.9, '小'], [1, '标准'], [1.15, '大']])),
          row('eyeOff', '沉浸模式', toggle('immersive'), '城市中隐藏全部界面，只看画面' + (CM.Keys.hint('ui.hideUI') ? '（' + CM.Keys.hint('ui.hideUI') + ' 切换）' : '')),
          group('地图'),
          row('view3d', '画质', seg('gfx', [['auto', '自动'], ['standard', '标准'], ['high', '高质量']]), '自动：按画面负载调整细节。标准：减少远景细节和动画，优先流畅。高质量：保留更多细节，优先画面。'),
          row('label', '地图标注', seg('labels', [['all', '全部'], ['stations', '仅车站'], ['none', '关闭']])),
          row('car', '车辆与行人', toggle('agents'), '关闭后交通模拟照常进行，只是不显示运动的车辆和行人'),
          group('辅助功能'),
          row('eyeOff', '色盲辅助模式', (function () { const b = toggle('colorBlind'); b.setAttribute('aria-label', '色盲辅助模式'); return b; })(), '增强线路配色与编号、图表线型和拥堵分级，原有线路颜色保留')]);
      },
      audio: function () {
        volRows.length = 0;
        return [group('声音'),
          row('sound', '启用声音', toggle('sound', function () { volRows.forEach(function (r) { r.classList.toggle('off', !S.get('sound')); }); })),
          volRow('volume', 'sound', '总音量', '界面音效与全部声音'),
          volRow('trainVol', 'train', '列车音效', '列车行驶、进出站与车门提示；跟随列车时更突出'),
          volRow('ambVol', 'building', '城市环境音', '车流、人声、水面与鸟鸣，随镜头位置、城区和时段变化')];
      },
      game: function () {
        return [group('进度'),
          row('save', '自动保存', toggle('autosave'), '暂停、每月结算与每次建设后自动保存'),
          group('时间'),
          row('clock', '停运时段快速掠过', toggle('nightFast'), '地铁停运的 00:00–06:00 按所选速度的 ' + CFG.time.nightFast + ' 倍推进，一天更快过去；结算与客流不受影响'),
          row('hourglass', '高峰慢放', toggle('peakSlow'),'工作日早高峰（7–9 时）与晚高峰（17–19 时）自动按 1× 运行，高峰结束后恢复所选速度；也可在顶栏的更多倍速中' + (CM.Keys.hint('time.peakSlow') ? '（' + CM.Keys.hint('time.peakSlow') + '）' : '') + '切换'),
          group('建设'),
          row('graticule', '网格吸附', toggle('gridSnap'), '显示经纬网格' + (CM.Keys.hint('view.grid') ? '（' + CM.Keys.hint('view.grid') + '）' : '') + '时，新车站、线路与转弯点落在网格交叉点')];
      },
      // 键位（v2.1）：点击按键框后按下新按键或组合键；右键清除；冲突时从原操作上移除并提示
      keys: function () {
        const K = CM.Keys, out = [h('div', { class: 'set-note' }, '点击按键框，再按下新的按键或组合键（可带 Ctrl / Alt / Shift）；右键按键框可清除。Esc（游戏中暂停并打开菜单，弹窗内返回）与 F11（全屏）固定不变。')];
        const rerender = function () { const top = body.scrollTop; body.replaceChildren.apply(body, pages.keys()); body.scrollTop = top; };
        const capture = function (a, i, btn) {
          if (self._keyCap) self._keyCap();
          btn.classList.add('listening'); btn.textContent = '按下新按键…';
          const end = function () { window.removeEventListener('keydown', onKey, true); document.removeEventListener('pointerdown', onDown, true); self._keyCap = null; };
          const onDown = function (e) { if (!btn.contains(e.target)) { end(); rerender(); } };
          const onKey = function (e) {
            e.preventDefault(); e.stopImmediatePropagation();
            if (e.code === 'Escape') { end(); rerender(); return; }
            const combo = K.comboOf(e); if (!combo) return;   // 只按了修饰键：继续等待
            const reserved = K.reserved(combo);
            if (reserved) { self.toast(reserved, 'warn'); return; }
            const owner = K.owner(combo, a.id);
            if (owner) { K.set(owner.id, K.get(owner.id).filter(function (c) { return c !== combo; })); self.toast(K.label(combo) + ' 已从「' + owner.name + '」改到「' + a.name + '」', 'info'); }
            const list = K.get(a.id); list[i] = combo;
            K.set(a.id, list.filter(function (c, j) { return c && list.indexOf(c) === j; }));
            end(); snd('good'); rerender();
          };
          self._keyCap = function () { end(); };
          window.addEventListener('keydown', onKey, true);
          document.addEventListener('pointerdown', onDown, true);
        };
        const keyRow = function (a) {
          const cur = K.get(a.id);
          const slot = function (i) {
            const c = cur[i];
            return h('button', { class: 'keycap' + (c ? '' : ' empty'), 'data-silent': '1', 'data-tip': c ? '点击修改，右键清除' : '点击设置按键',
              onclick: function (e) { capture(a, i, e.currentTarget); },
              oncontextmenu: function (e) { e.preventDefault(); if (!c) return; K.set(a.id, cur.filter(function (x, j) { return j !== i; })); snd('soft'); rerender(); } }, c ? K.label(c) : (i ? '＋' : '未设置'));
          };
          return h('div', { class: 'set-row key-row', 'data-action': a.id }, h('div', { class: 'grow set-t' }, a.name),
            h('div', { class: 'key-slots' }, slot(0), slot(1)),
            h('button', { class: 'iconbtn', 'data-tip': '恢复默认（' + (a.def.map(K.label).join(' / ') || '未设置') + '）', disabled: K.isDefault(a.id), onclick: function () { K.reset(a.id); snd('soft'); rerender(); } }, ic('undo')));
        };
        for (const gr of K.GROUPS) {
          out.push(group(gr[1]));
          for (const a of K.ACTIONS) if (a.group === gr[0]) out.push(keyRow(a));
        }
        out.push(h('div', { class: 'set-row' }, h('span', { class: 'grow' }), h('button', { class: 'btn sm ghost', onclick: function () { K.resetAll(); snd('soft'); rerender(); self.toast('键位已恢复默认', 'info'); } }, '全部恢复默认')));
        return out;
      },
      data: function () {
        return [group('存档'), h('div', { class: 'set-note' }, '进度保存在当前浏览器、当前网址的站点数据（' + CM.Save.backend() + '）中；更换环境前请导出备份。')].concat(extra('data'), [
          row('folder', '存档管理', h('button', { class: 'btn sm', onclick: function () { self.showSaveManager(inGame); } }, '打开'), '查看、改名、导入或导出全部进度与存档')]);
      },
      about: function () {
        const doc = function (title, file) {
          return h('button', { class: 'btn sm', onclick: function () { self.showTextDoc(title, file, function () { self.showSettings('about'); }); } }, '查看');
        };
        const link = function (icon, title, label, href) {
          const email = href.indexOf('mailto:') === 0;
          return h('a', { class: 'set-row about-link', href: href, target: email ? null : '_blank', rel: email ? null : 'noopener noreferrer' },
            h('span', { class: 'set-ico' }, ic(icon)),
            h('div', { class: 'grow' }, h('div', { class: 'set-t' }, title), h('div', { class: 'set-d', 'data-no-i18n': true }, label)), ic(email ? 'mail' : 'external', 16));
        };
        const osm = h('a', { href: 'https://www.openstreetmap.org/copyright', target: '_blank', rel: 'noopener' }, 'openstreetmap.org/copyright');
        return [h('div', { class: 'about-head' },
            h('img', { class: 'logo-ink', src: 'img/logo-navy.png', alt: '' }),
            h('div', null, h('div', { class: 'about-name' }, '城市与地铁'), h('div', { class: 'muted' }, '版本 v' + CFG.GAME_VERSION + ' · 网页版'))),
          group('版权与许可'),
          row('shield', '使用许可', doc('使用许可', 'LICENSE.txt'), '© 2026 VinsonFung，保留所有权利'),
          row('book', '第三方声明', doc('第三方声明', 'THIRD_PARTY_NOTICES.txt'), '游戏使用的开源组件与数据的许可说明'),
          row('globe', '地图数据', null, h('span', null, '© OpenStreetMap 贡献者，按 ODbL 1.0 授权（', osm, '）')),
          group('版本'),
          row('megaphone', '更新公告', h('button', { class: 'btn sm', onclick: function () { self.showNews(function () { self.showSettings('about'); }); } }, '查看'), '各版本的主要变化'),
          link('github', '游戏 GitHub 仓库', 'VinsonFung/city-and-metro', 'https://github.com/VinsonFung/city-and-metro'),
          group('联系作者'),
          link('globe', '博客', 'vinsonblog.cn', 'https://vinsonblog.cn/'),
          link('mail', '邮箱', 'hello@vinsonblog.cn', 'mailto:hello@vinsonblog.cn'),
          link('youtube', 'YouTube', '@vinson_fung', 'https://youtube.com/@vinson_fung'),
          link('socialX', 'X', '@vinson_fung', 'https://x.com/vinson_fung')];
      },
    };
    const body = h('div', { class: 'set-body' });
    const nav = h('div', { class: 'set-nav', role: 'tablist', 'aria-label': '设置分类' });
    const tabs = {};
    const show = function (id, silent) {
      if (self._keyCap) self._keyCap();   // 切换分页时结束正在进行的按键录制
      cur = id; self._setTab = id;
      for (const k in tabs) { tabs[k].classList.toggle('on', k === id); tabs[k].setAttribute('aria-selected', k === id ? 'true' : 'false'); }
      body.replaceChildren.apply(body, pages[id]());
      body.scrollTop = 0;
      if (!silent) snd('soft');
    };
    SET_TABS.forEach(function (t) {
      tabs[t[0]] = h('button', { class: 'set-tab', role: 'tab', 'data-silent': '1', onclick: function () { if (cur !== t[0]) show(t[0]); } }, ic(t[1]), h('span', null, t[2]));
      nav.appendChild(tabs[t[0]]);
    });
    const card = h('div', { class: 'card settings tabbed' },
      h('div', { class: 'card-head' }, h('span', { class: 'badge b-slate' }, ic('gear')), h('h2', null, '设置'), h('span', { class: 'grow' }), h('button', { class: 'iconbtn', 'data-tip': '关闭', 'data-key': 'Esc', onclick: back }, ic('close'))),
      h('div', { class: 'set-wrap' }, nav, body),
      h('div', { class: 'set-foot' },
        h('span', { class: 'grow' }),
        h('button', { class: 'btn sm ghost', onclick: function () { self.confirm('恢复默认设置？', '所有设置恢复为默认值，存档不受影响。', '恢复默认', function () { S.reset(); self.showSettings(cur); self.toast('已恢复默认设置', 'info'); }, true, 'gear'); } }, '恢复默认'),
        h('button', { class: 'btn primary sm', onclick: back }, '完成')));
    show(cur, true);
    this.openScreen(card, back);
  };
  // 文本文档（使用许可、第三方声明）：在游戏内显示，不打开外部程序。
  // v2.1：全文内嵌在 js/legal.js（直接打开 index.html 时 fetch 读不到本地文件），按文档排版：标题、分节、段落与链接
  const CJK = /[⺀-鿿＀-￯　-〿]/;
  function docBlocks(text) {
    const lines = text.replace(/\r\n?/g, '\n').replace(/^﻿/, '').split('\n'), out = [];
    let para = [];
    const flush = function () { if (para.length) { out.push({ t: 'p', lines: para }); para = []; } };
    for (let i = 0; i < lines.length; i++) {
      const s = lines[i].trim();
      if (!s) { flush(); continue; }
      if (/^-{3,}$/.test(s)) continue;
      if (/^-{3,}$/.test((lines[i + 1] || '').trim()) || /^\d+\.\s*\S/.test(s)) { flush(); out.push({ t: 'h', text: s }); continue; }
      para.push(s);
    }
    flush();
    return out;
  }
  function docInline(text) {
    const frag = document.createDocumentFragment(), re = /https?:\/\/[^\s）)]+/g;
    let k = 0, m;
    while ((m = re.exec(text))) {
      if (m.index > k) frag.appendChild(document.createTextNode(text.slice(k, m.index)));
      frag.appendChild(h('a', { href: m[0], target: '_blank', rel: 'noopener' }, m[0]));
      k = m.index + m[0].length;
    }
    if (k < text.length) frag.appendChild(document.createTextNode(text.slice(k)));
    return frag;
  }
  function docRender(text) {
    const box = h('div', { class: 'doc-body', 'data-no-i18n': '' }), blocks = docBlocks(text);
    blocks.forEach(function (b, n) {
      if (b.t === 'h') { box.appendChild(h('h3', null, b.text)); return; }
      // 第一段为文档标题；「键: 值」形式的行逐行显示；其余按原文折行重新连成段落（中文之间不加空格）
      if (n === 0) { box.appendChild(h('div', { class: 'doc-title' }, b.lines.map(function (l, i) { return h('div', { class: i ? 'muted' : 'strong' }, l); }))); return; }
      if (b.lines.length > 1 && b.lines.every(function (l) { return /^[A-Za-z][\w ./-]*:\s/.test(l); })) {
        box.appendChild(h('dl', { class: 'doc-kv' }, b.lines.map(function (l) { const i = l.indexOf(':'); return h('div', null, h('dt', null, l.slice(0, i)), h('dd', null, docInline(l.slice(i + 1).trim()))); })));
        return;
      }
      let s = '';
      for (const l of b.lines) s += !s ? l : (CJK.test(s.slice(-1)) && CJK.test(l[0]) ? '' : ' ') + l;
      box.appendChild(h('p', null, docInline(s)));
    });
    return box;
  }
  UI.prototype.showTextDoc = function (title, file, onBack) {
    const self = this;
    const close = function () { if (onBack) onBack(); else self.closeScreen(); };
    const wrap = h('div', { class: 'doc-text' });
    const embedded = CM.LEGAL && CM.LEGAL[file];
    if (embedded) wrap.appendChild(docRender(embedded));
    else {
      wrap.textContent = '正在读取…';
      fetch(file, { cache: 'no-store' }).then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.text(); })
        .then(function (t) { wrap.replaceChildren(docRender(t)); }).catch(function (e) { wrap.textContent = '无法读取 ' + file + '：' + (e && e.message || e); });
    }
    const card = h('div', { class: 'card doc' },
      h('div', { class: 'card-head' }, h('span', { class: 'badge b-slate' }, ic('book')), h('h2', null, title), h('span', { class: 'grow' }),
        h('button', { class: 'iconbtn', 'data-tip': '返回', 'data-key': 'Esc', onclick: close }, ic('close'))),
      wrap,
      h('div', { class: 'modal-actions' }, h('button', { class: 'btn primary sm', onclick: close }, '返回')));
    this.openScreen(card, close);
  };
  // 开始游戏 → 选择地图：每张地图可开始新游戏（选择模式）、继续该地图最近的进度，或读取该地图的存档
  UI.prototype.showNewGame = function () { this.showMapSelect(); };
  // mapId：只显示该地图的进度（从地图选择页进入时）
  // onBack（v2.5）：返回时回到打开它的界面（如世界地图办公桌上的档案盒）
  UI.prototype.showSaveManager = function (inGame, mapId, onBack) {
    const self = this;
    const fileIn = h('input', { type: 'file', accept: '.json,.cmsave,application/json', style: { display: 'none' }, onchange: function (e) { const f = e.target.files[0]; if (f) self.importFile(f, true); e.target.value = ''; } });
    const list = h('div');
    const editing = new Set();
    const draw = function () {
      // 保存、导入等后台操作可能要求刷新列表；编辑结束前保留原输入框，避免丢字、焦点或打断中文输入。
      if (editing.size) return;
      list.innerHTML = '';
      const games = CM.Save.list(mapId);
      if (!games.length) list.appendChild(h('div', { class: 'note' }, mapId ? '该地图暂无存档。' : '暂无存档。'));
      for (const gm of games) {
        const grp = h('div', { class: 'game-group', 'data-game-id': gm.gameId });
        const title = h('span', { class: 'save-name-title', 'data-no-i18n': '' }, gm.name);
        const rename = h('button', { class: 'btn sm ghost save-name-rename', onclick: function () {
          if (editing.has(gm.gameId)) return;
          editing.add(gm.gameId); rename.disabled = true;
          const inputId = U.uid('save-name-');
          const input = h('input', { id: inputId, class: 'save-name-input', type: 'text', value: gm.name, autocomplete: 'off' });
          const status = h('div', { class: 'save-name-status tiny', role: 'status', 'aria-live': 'polite' });
          let busy = false;
          const finish = function () {
            editing.delete(gm.gameId); editor.remove(); rename.disabled = false;
            if (!editing.size) draw();
            const group = Array.from(list.children).find(function (el) { return el.dataset.gameId === gm.gameId; });
            const btn = group && group.querySelector('.save-name-rename'); if (btn) btn.focus();
          };
          const error = function (text) { status.textContent = text; status.classList.add('bad'); input.setAttribute('aria-invalid', 'true'); input.focus(); };
          const saveName = async function () {
            if (busy) return;
            const name = input.value.trim();
            if (!name) { error('名称不能为空，请输入进度名称。'); return; }
            busy = true; input.readOnly = true; save.disabled = cancel.disabled = true;
            status.textContent = '正在保存名称…'; status.classList.remove('bad'); input.removeAttribute('aria-invalid');
            try {
              // 已开始的自动或手动存档仍可能写入旧名称；等它们结束后再改索引。
              while (self.saving || self._manualSaves.size) {
                const pending = Array.from(self._manualSaves); if (self.saving) pending.push(self.saving);
                await Promise.all(pending);
              }
              const current = CM.Save.list().find(function (g) { return g.gameId === gm.gameId; });
              if (!current) throw new Error('该进度已不存在，请取消后刷新列表。');
              if (current.name !== name) CM.Save.rename(gm.gameId, name);
              const saved = CM.Save.list().find(function (g) { return g.gameId === gm.gameId; });
              if (!saved || saved.name !== name) throw new Error('未能写入名称，请重试。');
              const active = self.g();
              if (active && active.id === gm.gameId && active.name !== name) {
                active.name = name; active.touch(); self.markUnsaved(); self.scheduleAutosave();
              }
              gm.name = name; title.textContent = name;
              finish(); self.toast('进度名称已保存', 'good');
            } catch (e) {
              const reason = e && e.name === 'QuotaExceededError' ? '浏览器本地存储空间不足，请清理空间后重试。' : (e && e.message || '请稍后重试。');
              error('名称保存失败：' + reason);
            } finally { busy = false; input.readOnly = false; save.disabled = cancel.disabled = false; }
          };
          const save = h('button', { class: 'btn primary sm', onclick: saveName }, '保存');
          const cancel = h('button', { class: 'btn sm ghost', onclick: function () { if (!busy) finish(); } }, '取消');
          const editor = h('div', { class: 'save-name-editor' },
            h('label', { class: 'save-name-label', for: inputId }, '进度名称'),
            h('div', { class: 'save-name-controls' }, input, h('div', { class: 'save-name-actions' }, save, cancel)), status);
          editor.addEventListener('keydown', function (e) {
            if (e.isComposing || e.keyCode === 229) return;
            if (e.key === 'Enter' && e.target === input) { e.preventDefault(); e.stopPropagation(); saveName(); }
            else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); if (!busy) finish(); }
          });
          input.addEventListener('input', function () { status.textContent = ''; status.classList.remove('bad'); input.removeAttribute('aria-invalid'); });
          grp.insertBefore(editor, grp.children[1] || null); input.focus(); input.select();
        } }, ic('pencil'), '重命名');
        grp.appendChild(h('div', { class: 'h save-name-heading' }, ic(gm.mode === 'free' ? 'sparkle' : 'trophy'), title, h('span', { class: 'tag' }, gm.mode === 'free' ? '自由建造' : '经营挑战'), mapId ? null : h('span', { class: 'tag info' }, (CM.MAPS[gm.map || 'gz'] || { name: gm.map }).name),
          h('div', { class: 'save-name-actions' }, rename,
            h('button', { class: 'btn sm ghost danger', onclick: function () { self.confirm('删除整个进度？', '「' + gm.name + '」的全部 ' + gm.slots.length + ' 个存档将被永久删除。', '删除', function () { try { CM.Save.removeGame(gm.gameId); self.showSaveManager(inGame, mapId); } catch (e) { self.toast('删除失败：' + e.message, 'bad'); } }, true, 'trash'); } }, ic('trash'), '删除进度'))));
        for (const sl of gm.slots) grp.appendChild(self.slotRow(sl, inGame));
        list.appendChild(grp);
      }
    };
    draw();
    this.screenRefresh = draw;
    const back = function () { if (onBack) onBack(); else if (inGame) self.closeScreen(); else if (mapId) self.showMapSelect(mapId); else self.showStart(); };
    const card = h('div', { class: 'card wide' }, this.cardHead('folder', 'b-blue', '读取存档' + (mapId && CM.MAPS[mapId] ? ' · ' + CM.MAPS[mapId].name : '')),
      h('div', { class: 'note' }, '存档保存在当前浏览器、当前网址的站点数据中。每个进度相互独立；自动保存使用两个轮换槽位，手动存档最多 ' + CFG.saves.maxManual + ' 个。导入存档会新增槽位；同一进度已存在时创建独立副本。更换网址、浏览器或设备前请先导出备份。'),
      list, fileIn,
      h('div', { class: 'modal-actions' }, h('button', { class: 'btn', onclick: function () { fileIn.click(); } }, ic('import'), '导入存档文件'), h('button', { class: 'btn primary', onclick: back }, inGame ? '关闭' : '返回')));
    this.openScreen(card, back);
  };
  UI.prototype.importFile = function (file, keepScreen) {
    const self = this;
    if (file.size > 30 * 1024 * 1024) { this.toast('文件过大，不是有效的存档', 'bad'); return; }
    const rd = new FileReader();
    rd.onload = function () {
      CM.Save.importText(String(rd.result)).then(function (r) {
        self.toast('已导入存档「' + r.name + '」（地图：' + ((CM.MAPS[r.map] || {}).name || r.map) + '）', 'good');
        if (keepScreen && self.screenRefresh) self.screenRefresh();
        else self.confirm('导入成功', '存档「' + r.name + '」已加入存档列表。是否立即载入？', '载入', function () { self.loadSlot(r.slotId); }, false, 'import');
      }).catch(function (e) {
        snd('error');
        self.openScreen(h('div', { class: 'card' }, self.cardHead('error', 'b-red', '导入失败'), self.callout('bad', 'error', e.message), h('div', { class: 'note' }, '原有存档未受影响。'), h('div', { class: 'modal-actions' }, h('button', { class: 'btn primary', onclick: function () { if (self.g()) self.closeScreen(); else self.showStart(); } }, '确定'))));
      });
    };
    rd.onerror = function () { self.toast('读取文件失败', 'bad'); };
    rd.readAsText(file);
  };
  UI.prototype.exportSlot = function (slotId) {
    const self = this;
    return CM.Save.exportSlot(slotId).then(function (r) {
      self.toast(r && r.raw ? '已导出原始存档数据，可用于恢复检查；当前载入问题仍需处理' : '已导出存档', r && r.raw ? 'warn' : 'good');
      return r;
    }).catch(function (e) { self.toast('导出失败：' + e.message, 'bad'); return { error: e.message }; });
  };
  UI.prototype.showLoadError = function (e, slotId) {
    const self = this;
    this._slotLoadRequest = null; snd('error');
    const message = e && e.message || '存档数据未能在当前版本中恢复。';
    this.openScreen(h('div', { class: 'card' }, this.cardHead('error', 'b-red', '无法载入'), this.callout('bad', 'error', message),
      h('div', { class: 'note' }, '原存档与当前进度已保留。若旧档持续无法载入，可先导出备份，再选择其他存档或新建游戏。'),
      h('div', { class: 'modal-actions' },
        slotId ? h('button', { class: 'btn', onclick: function () { self.exportSlot(slotId); } }, '导出原存档') : null,
        h('button', { class: 'btn', onclick: function () { self.showSaveManager(!!self.g()); } }, '其他存档'),
        h('button', { class: 'btn', onclick: function () { self.backToMenu(function () { self.showMapSelect(); }); } }, '新建游戏'),
        h('button', { class: 'btn primary', onclick: function () { if (self.g()) self.closeScreen(); else self.showStart(); } }, '返回'))));
  };
  UI.prototype.loadSlot = function (slotId) {
    const self = this, request = this._slotLoadRequest = {};
    this.showLoading('正在读取存档…', 'load', CM.Save.slotInfo(slotId)?.map);
    CM.Save.load(slotId).then(function (data) { if (self._slotLoadRequest === request) { self._loadingSlotId = slotId; CM.loadGame(data); } }, function (e) {
      if (self._slotLoadRequest !== request) return; self._slotLoadRequest = null;
      self.showLoadError(e, slotId);
    });
  };
  // 返回主菜单：先确认最新状态已成功保存；保存失败时保留当前游戏
  // after：返回后要打开的界面（默认主菜单）
  // 短暂的忙碌遮罩（透明，挡住点击）：保存等很快完成的操作不弹出卡片（v2.3）
  UI.prototype.showBusy = function (on) {
    if (!this._busy) { this._busy = h('div', { id: 'busyBlock', 'aria-hidden': 'true' }); document.body.appendChild(this._busy); }
    this._busy.classList.toggle('on', !!on);
  };
  UI.prototype.backToMenu = function (after) {
    const self = this;
    const g = this.g();
    // 回主菜单（v2.3）：开始界面整体淡入，标题与按钮不再逐个重新弹出
    const go = function () { CM.endGame(); if (typeof after === 'function') after(); else self.showStart(null, true); };
    if (!g) { go(); return; }
    const leave = function () {
      if (g.speed > 0) self.setSpeed(0);   // 先暂停，保证保存的就是离开时的状态
      if (self.isSaved()) { go(); return; }
      // 保存很快时不弹出保存卡片（以前会一闪而过）；超过 0.35 秒才显示
      self.showBusy && self.showBusy(true);
      const slow = setTimeout(function () { if (self.g() === g) self.showLoading('正在保存当前进度…'); }, 350);
      self.doAutosave(true).then(function (r) {
        clearTimeout(slow); self.showBusy && self.showBusy(false);
        if (self.g() !== g) return;
        if (r && r.ok && self.isSaved()) { go(); return; }
        snd('error');
        self.openScreen(h('div', { class: 'card' }, self.cardHead('error', 'b-red', '保存失败，未返回主菜单'),
          self.callout('bad', 'error', (r && r.error) || '当前进度未能保存。'),
          h('div', { class: 'note' }, '当前游戏仍保留在内存中。可以重试，或先「导出当前进度」作为备份。'),
          h('div', { class: 'modal-actions' },
            h('button', { class: 'btn danger', onclick: function () { go(); } }, '不保存，直接返回'),
            h('button', { class: 'btn', onclick: function () { self.closeScreen(); } }, '留在游戏'),
            h('button', { class: 'btn primary', onclick: function () { self.closeScreen(); leave(); } }, '重试保存'))));
      });
    };
    const ev = g.draft ? g.draftEval() : null;
    if (ev && ev.changed) this.confirm('返回主菜单？', '未确认的建设草案不会保存（' + (ev.changes.add.length + ev.changes.mod.length + ev.changes.del.length) + ' 项修改）。当前进度会先保存，再返回主菜单。', '放弃草案并返回', leave, true, 'home');
    else leave();
  };

  // ======================== 保存 ========================
  UI.prototype.markUnsaved = function () { if (this.save.state !== 'saving') this.save.state = this.save.state === 'error' ? 'error' : 'unsaved'; };
  // 已保存 = 最近一次成功保存的就是当前状态（游戏版本与游戏时钟都一致）
  UI.prototype.isSaved = function () {
    const g = this.g(), s = this.save;
    if (!g || s.state !== 'saved' || !s.clock) return false;
    const c = g.clock;
    return s.rev === g.rev && s.clock.y === c.y && s.clock.m === c.m && s.clock.d === c.d && Math.abs(s.clock.minute - c.minute) < 1;
  };
  UI.prototype.saveSnap = function (g) { return { rev: g.rev, clock: Object.assign({}, g.clock) }; };
  UI.prototype.markSaved = function (g, at, snap) { this.save = Object.assign({ state: 'saved', at: at, msg: '' }, snap || this.saveSnap(g)); };
  UI.prototype.scheduleAutosave = function () {
    const self = this;
    if (!CM.Settings.get('autosave')) return;
    clearTimeout(this._autoT);
    this._autoT = setTimeout(function () { const g = self.g(); if (g && !g.jumping && !g.pending) self.doAutosave(); else if (g) self.scheduleAutosave(); }, 700);
  };
  // 自动保存；返回 Promise<{ok, error}>。force：返回菜单等场合，等待进行中的保存结束后再保存最新状态
  UI.prototype.doAutosave = function (force) {
    if (CM.isLoading && CM.isLoading()) return Promise.resolve({ ok: false, error: '正在载入游戏，请稍后保存' });
    const g = this.g(); if (!g) return Promise.resolve({ ok: true });
    this.lastAuto = performance.now();
    const self = this;
    // 旧存档升级但升级前备份未能建立：暂停自动保存，避免自动存档轮换覆盖原存档（手动保存为新存档不受影响）
    if (g.backupFailed) return Promise.resolve({ ok: false, error: '升级前备份未建立，已暂停自动保存（可手动保存为新存档）' });
    // 拖动编辑或月度结算进行中：不保存中间状态（force 时稍后重试）
    if ((g.draft && g.draft.liveSnap) || g.pending || g.jumping) return force ? new Promise(function (res) { setTimeout(function () { res(self.doAutosave(true)); }, 200); }) : Promise.resolve({ ok: false, error: '正在结算' });
    if (this.saving) return force ? this.saving.then(function () { return self.isSaved() ? { ok: true } : self.doAutosave(true); }) : this.saving;
    this.save.state = 'saving';
    const ver = this.saveSeq = (this.saveSeq || 0) + 1;
    const snap = this.saveSnap(g);
    this.saving = CM.Save.save(g, 'auto').then(function (r) {
      self.saving = null;
      if (self.g() !== g) return r;
      if (r.ok) { if (self.saveSeq === ver) self.markSaved(g, r.savedAt, snap); }
      else { self.save = Object.assign({}, self.save, { state: 'error', at: Date.now(), msg: r.error }); self.toast('自动保存失败：' + r.error, 'bad'); }
      return r;
    });
    return this.saving;
  };
  UI.prototype.manualSave = function (slotId, label) {
    if (CM.isLoading && CM.isLoading()) return Promise.resolve({ ok: false, error: '正在载入游戏，请稍后保存' });
    const g = this.g(); if (!g) return Promise.resolve();
    if (g.pending || g.jumping) { this.toast('正在进行月度结算，请稍候再保存', 'info'); return Promise.resolve({ ok: false, error: '正在结算' }); }
    const self = this, snap = this.saveSnap(g);
    const pending = CM.Save.save(g, 'manual', { slotId: slotId, label: label || ('手动存档 ' + g.clock.y + '年' + g.clock.m + '月') }).then(function (r) {
      if (self.g() !== g) return r;
      if (r.ok) { self.markSaved(g, r.savedAt, snap); self.toast('已保存到本地（' + (r.size / 1024).toFixed(0) + ' KB）', 'good'); }
      else { self.save = Object.assign({}, self.save, { state: 'error', at: Date.now(), msg: r.error }); self.toast('保存失败：' + r.error, 'bad'); }
      self.rerenderPage();
      if (self.screenRefresh) self.screenRefresh();
      return r;
    });
    this._manualSaves.add(pending);
    return pending.finally(function () { self._manualSaves.delete(pending); });
  };

  // ======================== 跳月/跳年 与 失败 ========================
  UI.prototype.showJump = function () {
    const g = this.g(), j = g.jumping;
    this.jumpBar = h('i', { style: { width: '2%' } });
    const t = j.target;
    this.openScreen(h('div', { class: 'card' }, this.cardHead('calYear', 'b-teal', '时间推进中'), h('div', { class: 'note' }, g.clock.y + '年' + g.clock.m + '月 → ' + t[0] + '年' + t[1] + '月：逐日结算票款与运营费用，按月处理拨款、城市发展、区域开放与任务。'), h('div', { class: 'progress', style: { marginTop: '14px', height: '9px' } }, this.jumpBar)), null);
  };
  UI.prototype.updateJump = function (p) { if (this.jumpBar) this.jumpBar.style.width = Math.round(p * 100) + '%'; };
  // 推进完成报告：推进一个月给出简短消息（可展开完整报告）；推进一年直接显示报告。
  // 报告：期间时间轴（大事标记）· 城市与交通指标卡（前 → 后与变化）· 城市经济 · 财政收支（经营挑战）· 任务 · 期间大事
  UI.prototype.showJumpResult = function (r) {
    const g = this.g(), self = this, a = r.after;
    const months = (r.to[0] - r.from[0]) * 12 + (r.to[1] - r.from[1]);
    this.lastReport = r;
    if (months <= 1 && !r.failed) {
      this.closeScreen();
      const d = a.pop - r.before.pop;
      this.toast('已推进到 ' + r.to[0] + '年' + r.to[1] + '月：人口 ' + U.fmtPeople(a.pop) + '（' + (d >= 0 ? '+' : '−') + U.fmtPeople(Math.abs(d)) + '），地铁分担率 ' + U.fmtPct(a.share) + (g.econ.isFree() ? '' : '，资金 ' + U.fmtMoney(a.funds)), 'good', { label: '查看报告', fn: function () { self.showReport(r); } });
      this.rerenderPage();
      return;
    }
    this.showReport(r);
    this.rerenderPage();
  };
  UI.prototype.showReport = function (r) {
    const g = this.g(), self = this, b = r.before, a = r.after, free = g.econ.isFree();
    const fromYm = U.ymIndex(r.from[0], r.from[1]), toYm = U.ymIndex(r.to[0], r.to[1]), months = Math.max(1, toYm - fromYm);
    const evs = g.events.filter(function (e, i) { const ym = U.ymIndex(e.y, e.m); return (ym > fromYm && ym <= toYm) || (ym === fromYm && i >= b.events); });
    const cat = function (e) {
      if (e.kind === 'econ') return ['econ', '经济', '#7c5cd6'];
      if (e.tag === '任务') return ['task', '任务', '#c27c0e'];
      if (/^新区域开放|^填海成陆/.test(e.title)) return ['city', '城市', '#1f9254'];
      if (e.tag === '建设' || e.tag === '经营') return ['build', e.tag, '#2f6fa8'];
      if (e.tag === '模拟') return ['sim', '模拟', '#8a7ad6'];
      return ['hist', '史实', '#c46a2a'];
    };
    // ---- 期间时间轴 ----
    const tl = h('div', { class: 'jr-tl' });
    for (let k = 0; k <= months; k++) {
      const ym = fromYm + k, y = Math.floor(ym / 12), m = ym % 12 + 1;
      const here = evs.filter(function (e) { return U.ymIndex(e.y, e.m) === ym; });
      const cats = Array.from(new Set(here.map(function (e) { return cat(e)[0]; })));
      tl.appendChild(h('div', { class: 'jr-m' + (k === 0 ? ' first' : '') + (k === months ? ' last' : ''), 'data-tip': here.length ? y + '年' + m + '月：' + here.map(function (e) { return e.title; }).slice(0, 4).join('；') : null },
        h('i', { class: 'jr-dot' + (here.length ? ' on' : '') }, cats.slice(0, 3).map(function (c) { const e = here.find(function (x) { return cat(x)[0] === c; }); return h('b', { style: { background: cat(e)[2] } }); })),
        // 标签：起点、终点，以及与两端相距 3 个月以上的每年 1 月（避免相互重叠）
        (k === 0 || k === months || (m === 1 && k >= 3 && months - k >= 3)) ? h('span', null, y + '.' + m) : null));
    }
    // ---- 指标卡 ----
    const tile = function (icon, label, x0, x1, fmt, betterUp, dfmt) {
      const d = x1 - x0, eps = Math.abs(x0) * 1e-6 + 1e-9, flat = Math.abs(d) < eps;
      const cls = flat ? 'muted' : ((d > 0) === betterUp ? 'good' : 'bad');
      return h('div', { class: 'jr-tile' }, h('div', { class: 'jt-k' }, ic(icon, 15), label), h('div', { class: 'jt-v num' }, fmt(x1)),
        h('div', { class: 'jt-d ' + cls }, flat ? '持平' : (d > 0 ? '▲ ' : '▼ ') + (dfmt || fmt)(Math.abs(d))), h('div', { class: 'jt-b' }, '原 ' + fmt(x0)));
    };
    const pp = function (x) { return (x * 100).toFixed(1) + ' 个百分点'; };
    const grid = h('div', { class: 'jr-grid' },
      tile('people', '人口', b.pop, a.pop, U.fmtPeople, true),
      tile('briefcase', '就业岗位', b.jobs, a.jobs, U.fmtPeople, true),
      tile('metro', '日均地铁客运', b.riders, a.riders, U.fmtPeople, true),
      tile('train', '地铁分担率', b.share, a.share, function (x) { return U.fmtPct(x); }, true, pp),
      tile('car', '拥堵指数', b.cong, a.cong, function (x) { return x.toFixed(2); }, false),
      tile('timer', '平均通勤', b.commute, a.commute, function (x) { return U.fmtNum(x, 1) + ' 分'; }, false),
      tile('smile', '满意度', b.sat, a.sat, function (x) { return String(Math.round(x)); }, true, function (x) { return x.toFixed(1); }),
      tile('map', '已开放区域', b.regions, a.regions, function (x) { return x + ' 个'; }, true, function (x) { return x + ' 个'; }));
    const parts = [h('div', { class: 'jr-sec' }, ic('building', 15), '城市与交通'), grid];
    // ---- 城市经济 ----
    if (g.macro && CM.Macro) {
      const mv = CM.Macro.view(g), recs = g.macro.rec.slice(b.macroRecs || 0);
      const box = h('div', { class: 'jr-econ' });
      if (recs.length) for (const rc of recs) box.appendChild(h('div', { class: 'je-row' }, h('b', null, rc.y + ' 年'), h('span', null, 'GDP ' + UI.fmtBig(rc.nom)), h('span', { class: rc.growth == null ? 'muted' : (rc.growth >= 0 ? 'good' : 'bad') }, '实际增长 ' + UI.pctS(rc.growth)), h('span', { class: 'muted' }, '价格 ' + UI.pctS(rc.infl))));
      else box.appendChild(h('div', { class: 'small muted' }, '期间没有年度结算（每年 1 月结算上一年）。本年预测：GDP 约 ' + UI.fmtBig(mv.fc.nom) + (mv.fc.growth != null ? '，实际增长约 ' + UI.pctS(mv.fc.growth) : '') + '。'));
      box.appendChild(h('div', { class: 'je-env' }, h('span', { class: 'env-chip ' + mv.env.cls }, ic('pulse', 13), '经济环境：' + mv.env.label), h('span', { class: 'env-chip ' + (mv.te.eff >= 1 ? 'good' : 'warn') }, ic('metro', 13), '交通对经济 ' + UI.pctS(mv.te.eff - 1)),
        !free && Math.abs(a.fiscF - b.fiscF) > 1e-6 ? h('span', { class: 'env-chip ' + (a.fiscF >= b.fiscF ? 'good' : 'warn') }, ic('bank', 13), '财力系数 ×' + b.fiscF.toFixed(2) + ' → ×' + a.fiscF.toFixed(2)) : null));
      parts.push(h('div', { class: 'jr-sec' }, ic('trend', 15), '城市经济', h('button', { class: 'linkbtn', onclick: function () { self.closeScreen(); self.openTop('econ'); } }, '查看', ic('chev', 13))), box);
    }
    // ---- 财政（经营挑战）：期间已封账月份的收支 ----
    if (!free) {
      const rows = g.econ.ledger.filter(function (x) { const ym = U.ymIndex(x.y, x.m); return ym >= fromYm && ym < toYm; });
      let inc = 0, ops = 0, bld = 0, svc = 0, bond = 0;
      for (const x of rows) { inc += (x.grant || 0) + (x.fare || 0) + (x.reward || 0); ops += x.ops || 0; for (const k of CM.Economy.BUILD_KINDS) bld += x[k] || 0; svc += (x.interest || 0) + (x.principal || 0) + (x.penalty || 0); bond += x.bond || 0; }
      const fb = h('div', { class: 'jr-fin' },
        h('div', null, h('small', null, '财政收入'), h('b', { class: 'good' }, '+' + U.fmtMoney(inc))),
        h('div', null, h('small', null, '运营成本'), h('b', { class: 'warn' }, '−' + U.fmtMoney(ops))),
        bld > 0.5 ? h('div', null, h('small', null, '建设支出'), h('b', { class: 'warn' }, '−' + U.fmtMoney(bld))) : null,
        svc > 0.5 ? h('div', null, h('small', null, '偿债'), h('b', { class: 'bad' }, '−' + U.fmtMoney(svc))) : null,
        bond > 0.5 ? h('div', null, h('small', null, '债券募集'), h('b', null, '+' + U.fmtMoney(bond))) : null,
        h('div', { class: 'jf-net' }, h('small', null, '一般资金'), h('b', { class: a.funds >= b.funds ? 'good' : 'bad' }, U.fmtMoney(b.funds) + ' → ' + U.fmtMoney(a.funds))));
      parts.push(h('div', { class: 'jr-sec' }, ic('coin', 15), '财政收支（' + rows.length + ' 个已结算月份）', h('button', { class: 'linkbtn', onclick: function () { self.closeScreen(); self.openTop('money'); } }, '查看', ic('chev', 13))), fb);
    }
    // ---- 任务 ----
    const tEv = evs.filter(function (e) { return e.tag === '任务'; });
    if (tEv.length) {
      const chip = function (e) { const ok = e.title.indexOf('任务完成') === 0, bad = e.title.indexOf('任务未完成') === 0; return h('div', { class: 'jr-task ' + (ok ? 'ok' : (bad ? 'bad' : 'new')) }, ic(ok ? 'check' : (bad ? 'close' : 'flag'), 14), h('span', null, e.title.replace(/^(新任务|任务完成|任务未完成)[:：]\s*/, '')), h('em', null, ok ? '完成' : (bad ? '未完成' : '新任务'))); };
      parts.push(h('div', { class: 'jr-sec' }, ic('flag', 15), '任务', h('button', { class: 'linkbtn', onclick: function () { self.closeScreen(); self.openTop('tasks'); } }, '查看', ic('chev', 13))), h('div', { class: 'jr-tasks' }, tEv.slice(-8).map(chip)));
    }
    // ---- 期间大事（不含任务） ----
    const other = evs.filter(function (e) { return e.tag !== '任务'; });
    if (other.length) {
      parts.push(this.sec('jr-ev', '期间大事', other.length + ' 条', function () {
        const x = h('div', { class: 'jr-evs' });
        for (const e of other.slice(-40).reverse()) { const c = cat(e); x.appendChild(h('div', { class: 'jr-ev' }, h('span', { class: 'jr-ed' }, e.y + '.' + e.m), h('span', { class: 'jr-ec', style: { color: c[2], borderColor: c[2] } }, c[1]), h('span', { class: 'grow' }, e.title))); }
        return x;
      }, other.length <= 8, 'tasks'));
    }
    const card = h('div', { class: 'card jr' },
      h('div', { class: 'card-head' }, h('span', { class: 'badge ' + (r.failed ? 'b-red' : 'b-green') }, ic(r.failed ? 'error' : 'report')), h('div', { class: 'grow' }, h('h2', null, r.failed ? '推进中止：经营挑战失败' : '推进完成'), h('div', { class: 'tiny muted' }, r.from[0] + '年' + r.from[1] + '月 → ' + r.to[0] + '年' + r.to[1] + '月 · ' + months + ' 个月' + (evs.length ? ' · ' + evs.length + ' 件大事' : ''))),
        h('button', { class: 'iconbtn', 'data-tip': '关闭', 'data-key': 'Esc', onclick: function () { self.closeScreen(); } }, ic('close'))),
      h('div', { class: 'jr-scroll' }, tl, parts),
      h('div', { class: 'modal-actions' }, h('button', { class: 'btn', onclick: function () { self.closeScreen(); self.openStats(); } }, ic('chart'), '查看统计'), h('button', { class: 'btn primary', onclick: function () { self.closeScreen(); } }, '继续')));
    this.openScreen(card, function () { self.closeScreen(); });
  };
  UI.prototype.showFailure = function (f) {
    const g = this.g(), self = this;
    const card = h('div', { class: 'card' }, this.cardHead('error', 'b-red', '经营挑战失败'),
      this.callout('bad', 'error', h('div', null, f.reasons.map(function (r) { return h('div', null, '· ' + r); }))),
      this.kv([['资金', U.fmtMoney(g.econ.funds)], ['满意度', Math.round(g.econ.sat) + ''], ['连续负余额', g.econ.negMonths + ' 个月'], ['满意度过低', g.econ.lowSatMonths + ' 个月']]),
      h('div', { class: 'note', style: { marginTop: '8px' } }, '可以查看财政与指标详情了解恶化原因；读取之前的存档重新经营，或转为自由建造继续发展这座城市（城市经济照常模拟）。'),
      h('div', { class: 'modal-actions' },
        h('button', { class: 'btn', onclick: function () { self.closeScreen(); self.openPage('finance', null, { root: true }); } }, ic('coin'), '财政详情'),
        h('button', { class: 'btn', onclick: function () { self.showSaveManager(true); } }, ic('folder'), '读取存档'),
        h('button', { class: 'btn', onclick: function () { self.backToMenu(); } }, ic('home'), '主菜单'),
        h('button', { class: 'btn primary', onclick: function () { g.econ.mode = 'free'; g.mode = 'free'; g.econ.failed = null; g.logEvent({ tag: '经营', title: '转为自由建造模式继续', desc: '' }); self.closeScreen(); self.toast('已转为自由建造模式', 'info'); self.markUnsaved(); } }, ic('sparkle'), '转为自由建造继续')));
    this.openScreen(card, function () { self.closeScreen(); });
  };
  UI.prototype.unfoldMetrics = function () {
    if (!this.mFold) return;
    this.toggleMetricsMore(false);
    if (this.mMore.children.length) for (const k of METRIC_ORDER) { const el = this.pills[k].el; delete el.dataset.fold; this.mFold.parentNode.insertBefore(el, this.mFold); }
    this.mFold.classList.add('off');
  };

  UI.prototype.toggleMetricsMore = function (open) {
    const dd = this.mMore; if (!dd) return;
    const on = open == null ? dd.classList.contains('off') && dd.children.length > 0 : !!open;
    dd.classList.toggle('off', !on);
    this.mFold.classList.toggle('open', on); this.mFold.setAttribute('aria-expanded', on ? 'true' : 'false');
    if (!on) return;
    this.closeTimeOptions();
    const r = this.mFold.getBoundingClientRect();
    dd.style.top = (r.bottom + 8) + 'px';
    dd.style.left = Math.max(8, Math.min(r.right - dd.offsetWidth, window.innerWidth - dd.offsetWidth - 8)) + 'px';
  };

  UI.prototype.closeTimeOptions = function () {
    if (this.timeOptions) for (const kind of Object.keys(this.timeOptions)) this.toggleTimeOptions(kind, false);
  };

  UI.prototype.toggleTimeOptions = function (kind, open, focus) {
    const o = this.timeOptions && this.timeOptions[kind]; if (!o || !o.menu) return;
    const on = open == null ? o.menu.classList.contains('off') : !!open;
    if (on && (!this.g() || this.blocking())) return;
    if (!on && o.menu.classList.contains('off')) return;
    o.menu.classList.toggle('off', !on); o.menu.inert = !on; o.menu.setAttribute('aria-hidden', on ? 'false' : 'true');
    o.button.classList.toggle('open', on); o.button.setAttribute('aria-expanded', on ? 'true' : 'false');
    if (!on) { if (focus) o.button.focus(); return; }
    for (const k of Object.keys(this.timeOptions)) if (k !== kind) this.toggleTimeOptions(k, false);
    this.toggleMetricsMore(false);
    if (this.tools) this.tools.keys.clear();
    const r = o.button.getBoundingClientRect(), z = CM.Settings.get('uiScale') || 1, w = o.menu.offsetWidth * z, hh = o.menu.offsetHeight * z;
    o.menu.style.left = (U.clamp(r.right - w, 8, Math.max(8, window.innerWidth - w - 8)) / z) + 'px';
    o.menu.style.top = (U.clamp(r.bottom + 8, 8, Math.max(8, window.innerHeight - hh - 8)) / z) + 'px';
    o.menu.querySelector('button').focus();
  };

})(window.CM);
