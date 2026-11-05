'use strict';
// 地图快捷操作（v2.1 第二轮玩家反馈：改名、改色、延长、拆开与贯通以前要先打开详情、在长面板里找）：
// 选择工具下选中车站或线路后，在对象旁显示一行快捷按钮；右键车站或线路弹出同样的操作菜单。
// 改名、改色、拆开、贯通都在小气泡里直接完成；建设类操作照常进入草案
(function (CM) {
  const U = CM.U, h = U.h, M = CM.Metro, CFG = CM.CFG, AX = CM.Accessibility;
  const ic = function (n, s) { return CM.icon(n, s); };
  const snd = function (n) { if (CM.Sound) CM.Sound.play(n); };
  let ui = null, bar = null, pop = null, menu = null, cur = null, at = null, key = '';
  const Q = {};
  CM.Quick = Q;
  const game = function () { return CM.game; };
  const net = function () { const g = game(); return g.draft ? g.draft.net : g.net; };
  const zoom = function () { return CM.Settings.get('uiScale') || 1; };
  function bounds() {
    const v = ui && ui.viewport ? ui.viewport() : { left: 0, top: 0, right: innerWidth, bottom: innerHeight };
    const b = { left: v.left + 8, top: v.top + 8, right: v.right - 8, bottom: v.bottom - 8 };
    if (ui && ui.compact()) {
      const toolbar = ui.toolbar.getBoundingClientRect();
      if (toolbar.top > b.top + 80) b.bottom = Math.min(b.bottom, toolbar.top - 8);
    }
    return b;
  }
  function placeOverlay(el, x, y, above) {
    const z = parseFloat(getComputedStyle(el).zoom) || 1, b = bounds();
    el.style.maxWidth = Math.max(1, (b.right - b.left) / z) + 'px';
    el.style.maxHeight = Math.max(1, (b.bottom - b.top) / z) + 'px';
    const w = el.offsetWidth * z, hh = el.offsetHeight * z;
    if (above != null && y + hh > b.bottom) y = above - hh - 8;
    el.style.left = (U.clamp(x, b.left, Math.max(b.left, b.right - w)) / z) + 'px';
    el.style.top = (U.clamp(y, b.top, Math.max(b.top, b.bottom - hh)) / z) + 'px';
  }

  Q.init = function (u) {
    ui = u;
    bar = h('div', { id: 'objBar', class: 'glass hidden', role: 'toolbar' });
    document.getElementById('app').appendChild(bar);
    window.addEventListener('pointerdown', function (e) {
      if (pop && !pop.contains(e.target) && !bar.contains(e.target)) closePop();
      if (menu && !menu.contains(e.target)) closeMenu();
    }, true);
  };
  function closePop() { if (pop) { pop.remove(); pop = null; } }
  function closeMenu() { if (menu) { menu.remove(); menu = null; } }
  Q.close = function () { closePop(); closeMenu(); };
  Q.busy = function () { return !!(pop || menu); };

  // 当前选中对象的快捷操作：{ icon, label, fn(anchorEl), danger }
  function lineOf(sel) { const n = net(), s = sel.kind === 'seg' ? n.segments[sel.id] : null; return s ? s.line : null; }
  function stationActs(id) {
    const n = net(), s = n.stations[id]; if (!s) return [];
    const acts = [
      { icon: 'pencil', label: '改名', fn: function (b) { popRename('station', id, b); } },
      { icon: 'route', label: '从这里绘线', fn: function (b) { popDraw(id, b); } },
    ];
    const cuts = splitLines(id);
    if (cuts.length) acts.push({ icon: 'scissors', label: '在此拆开线路', fn: function (b) { popSplit(id, cuts, b); } });
    acts.push({ icon: 'layers', label: '规模与站台', fn: function () { ui.openObj('station', id, 'build'); } });
    // 运营车站的商业开发与装修主题（v2.3）：在小气泡里直接完成，不必进详情页
    if (game().net.stations[id]) {
      if (ui.todInfo(id)) acts.push({ icon: 'bag', label: '商业开发（TOD）', fn: function (b) { popTod(id, b); } });
      acts.push({ icon: 'palette', label: '车站装修', fn: function (b) { popDecor(id, b); } });
    }
    acts.push({ icon: 'cursor', label: '移动车站', fn: function () { ui.tools.setTool('edit'); ui.select({ kind: 'station', id: id }); ui.toast('拖动车站到新位置', 'info'); } });
    acts.push({ icon: 'bulldozer', label: '拆除', danger: true, fn: function () { ui.demolish({ kind: 'station', id: id }); } });
    return acts;
  }
  function lineActs(segId) {
    const n = net(), sg = n.segments[segId]; if (!sg) return [];
    const lid = sg.line;
    return [
      { icon: 'pencil', label: '改名', fn: function (b) { popRename('line', lid, b); } },
      { icon: 'palette', label: '改颜色', fn: function (b) { popColor(lid, b); } },
      { icon: 'route', label: '延长', fn: function (b) { popExtend(lid, b); } },
      { icon: 'merge', label: '贯通、拆开与支线', fn: function (b) { popOrg(lid, b); } },
    ].concat(game() && game().fleet && ui.lineOpsTab && game().net.lines[lid] ? [{ icon: 'train', label: '列车运营', fn: function () { ui.openObj('line', lid, 'ops'); } }] : [], [   // 列车运营（v2.5）：已运营的线路
      { icon: 'layers', label: '本段形式与线形', fn: function (b) { popSeg(segId, b); } },
      { icon: 'bulldozer', label: '拆除', danger: true, fn: function (b) { popDemolish(segId, b); } },
    ]);
  }
  function actsFor(sel) { return sel.kind === 'station' ? stationActs(sel.id) : lineActs(sel.id); }
  // 经过本站、可在本站拆开的线路（本站是线路中间站）
  function splitLines(sid) {
    const n = net();
    return M.stationLines(n, sid).filter(function (lid) { const tp = M.lineTopo(n, lid); return (tp.topo === 'path' || tp.topo === 'branch') && tp.adj && tp.adj.get(sid) && tp.adj.get(sid).length >= 2; });
  }

  // ---------------- 快捷按钮条 ----------------
  Q.show = function (sel) {
    closePop();
    const g = game();
    if (!g || !sel || (sel.kind !== 'station' && sel.kind !== 'seg') || ui.tools.tool !== 'select') { Q.hide(); return; }
    cur = { kind: sel.kind, id: sel.id };
    const T = ui.tools, n = net();
    if (sel.kind === 'station') { const s = n.stations[sel.id]; at = s ? [s.x, s.y] : null; }
    else {
      // 线路：停在点击处（光标在这段轨道附近时），否则取区段中点
      const sg = n.segments[sel.id]; at = null;
      if (sg) {
        const pts = M.segGeom(n, sg, g.city).pts, c = T.cursor;
        if (c && U.distToPoly(c.x, c.y, pts) < 0.6) at = [c.x, c.y];
        else { const p = pts[pts.length >> 1]; at = [p[0], p[1]]; }
      }
    }
    key = ''; render();
  };
  Q.hide = function () { cur = null; key = ''; if (bar) bar.classList.add('hidden'); Q.close(); };
  function render() {
    const g = game(); if (!g || !cur) return;
    const n = net(), d = g.draft;
    let name = '', color = null;
    if (cur.kind === 'station') { const s = n.stations[cur.id]; if (!s) { Q.hide(); return; } name = s.name; }
    else { const sg = n.segments[cur.id], L = sg && n.lines[sg.line]; if (!L) { Q.hide(); return; } name = L.name; color = AX.line(L); }
    const k = cur.kind + cur.id + '|' + name + '|' + color + '|' + (d ? d.ver : 0);
    if (k === key) return;
    key = k;
    bar.innerHTML = '';
    bar.appendChild(h('button', { class: 'ob-name', 'data-tip': '改名', onclick: function (e) { popRename(cur.kind === 'station' ? 'station' : 'line', cur.kind === 'station' ? cur.id : lineOf(cur), e.currentTarget); } },
      color ? h('span', { class: 'dot', style: { background: color } }) : ic('station', 14), h('span', null, name)));
    for (const a of actsFor(cur)) bar.appendChild(h('button', { class: 'ob-btn' + (a.danger ? ' danger' : ''), 'data-tip': a.label, 'aria-label': a.label, onclick: function (e) { snd('soft'); a.fn(e.currentTarget); } }, ic(a.icon, 17)));
    bar.appendChild(h('button', { class: 'ob-btn', 'data-tip': '详情', 'aria-label': '详情', onclick: function () { if (cur.kind === 'station') ui.openObj('station', cur.id, 'info'); else ui.openObj('line', lineOf(cur) + '|' + cur.id, 'info'); } }, ic('info', 17)));
    if (CM.I18n) CM.I18n.localize(bar);
  }
  // 每帧：跟随对象位置；离开选择工具、跟随列车、打开全屏界面或对象消失时收起
  Q.tick = function () {
    if (!bar) return;
    const g = game(), T = ui.tools;
    if (!g || ui.blocking() || (CM.Follow && CM.Follow.active())) { Q.hide(); return; }
    if (!cur) return;
    if (T.tool !== 'select' || !ui.selection || ui.selection.id !== cur.id) { Q.hide(); return; }
    render(); if (!cur) return;
    const R = ui.R, n = net();
    if (cur.kind === 'station') { const s = n.stations[cur.id]; if (s) at = [s.x, s.y]; }
    if (!at) return;
    // 跟着对象画面上的高度（高架车站、线路在 3D 中位于桥面），2D / 2.5D 下按钮条都贴着同一个对象（v2.3）
    const ob = cur.kind === 'station' ? n.stations[cur.id] : n.segments[cur.id];
    const p = R.P(at[0], at[1], ob ? R.trackH(ob.type) : 0), z = zoom();
    const w = bar.offsetWidth * z || 260, hh = bar.offsetHeight * z || 40;
    let x = p.x - w / 2, y = p.y - hh - 26;
    if (y < 70) y = p.y + 26;
    const b = bounds(); x = U.clamp(x, b.left, Math.max(b.left, b.right - w));
    bar.style.left = (x / z) + 'px'; bar.style.top = (U.clamp(y, b.top, Math.max(b.top, b.bottom - hh)) / z) + 'px';
    bar.classList.toggle('hidden', !!menu || p.x < -40 || p.y < -40 || p.x > window.innerWidth + 40 || p.y > window.innerHeight + 40);
  };

  // ---------------- 右键菜单 ----------------
  // 选择工具下右键车站或轨道：选中并在光标处列出同样的操作（文字菜单，便于第一次使用时找到）
  Q.context = function (sx, sy) {
    const g = game(), R = ui.R; if (!g) return false;
    const st = R.pickStation(sx, sy), seg = st ? null : R.pickSegment(sx, sy);
    if (!st && !seg) return false;
    const sel = st ? { kind: 'station', id: st } : { kind: 'seg', id: seg };
    ui.select(sel);
    closeMenu(); closePop();
    const n = net(), title = st ? n.stations[st].name : (n.lines[n.segments[seg].line] || {}).name;
    menu = h('div', { class: 'dropdown ctx-menu' }, h('div', { class: 'ctx-title' }, title || ''));
    const acts = actsFor(sel).concat([{ icon: 'info', label: '详情', fn: function () { if (st) ui.openObj('station', st, 'info'); else ui.openObj('line', n.segments[seg].line + '|' + seg, 'info'); } }]);
    for (const a of acts) menu.appendChild(h('button', { class: a.danger ? 'danger' : '', onclick: function () { const b = menuAnchor(); closeMenu(); a.fn(b); } }, ic(a.icon), h('span', { class: 'grow' }, a.label)));
    document.body.appendChild(menu);
    menu._at = { x: sx, y: sy };
    if (CM.I18n) CM.I18n.localize(menu);
    placeOverlay(menu, sx, sy);
    return true;
  };
  // 菜单关闭后气泡定位到原来的点击位置
  function menuAnchor() { const p = menu && menu._at; if (!p) return null; return { getBoundingClientRect: function () { return { left: p.x, right: p.x, top: p.y, bottom: p.y, width: 0, height: 0 }; } }; }

  // ---------------- 小气泡 ----------------
  function openPop(anchor, title, body) {
    closePop();
    pop = h('div', { class: 'qpop glass' }, h('div', { class: 'qpop-h' }, h('b', null, title), h('button', { class: 'iconbtn', 'aria-label': '关闭', onclick: closePop }, ic('close', 14))), body);
    document.body.appendChild(pop);
    if (CM.I18n) CM.I18n.localize(pop);
    const r = anchor && anchor.getBoundingClientRect ? anchor.getBoundingClientRect() : { left: window.innerWidth / 2, bottom: 120, top: 120 };
    placeOverlay(pop, r.left, r.bottom + 8, r.top);
    const f = pop.querySelector('input[type=text]'); if (f) { f.focus(); f.select(); }
    return pop;
  }
  function popRename(kind, id, anchor) {
    const n = net(), obj = kind === 'station' ? n.stations[id] : n.lines[id]; if (!obj) return;
    const input = h('input', { type: 'text', value: obj.name, maxlength: kind === 'station' ? 16 : 14, 'aria-label': kind === 'station' ? '站名' : '线路名称' });
    const msg = h('div', { class: 'tiny muted' }, '立即生效，不收费。');
    const apply = function () {
      const v = input.value.trim();
      if (kind === 'station') {
        const r = ui.setStationName(id, v);
        if (r.error) { msg.textContent = r.error; msg.className = 'tiny bad'; input.focus(); return; }
      } else {
        if (!v) { msg.textContent = '名称不能为空'; msg.className = 'tiny bad'; return; }
        if (v !== obj.name) ui.setLineLook(id, { name: v });
      }
      closePop(); key = ''; render();
    };
    input.addEventListener('keydown', function (e) { if (e.isComposing || e.keyCode === 229) return; if (e.key === 'Enter') { e.preventDefault(); apply(); } if (e.key === 'Escape') { e.preventDefault(); closePop(); } });
    openPop(anchor, kind === 'station' ? '车站改名' : '线路改名', h('div', null, h('div', { class: 'row' }, input, h('button', { class: 'btn sm primary', onclick: apply }, '确定')), msg));
  }
  function popColor(lid, anchor) {
    const n = net(), L = n.lines[lid]; if (!L) return;
    const box = h('div', { class: 'qpop-colors' });
    const pick = function (c) { ui.setLineLook(lid, { color: c.toLowerCase() }); key = ''; render(); mark(); };
    const all = (CM.DATA.lineColorsNice || []).concat((CM.UI.LINE_PALETTE || []).filter(function (c) { return (CM.DATA.lineColorsNice || []).indexOf(c) < 0; }), CM.Settings.get('recentColors') || []);
    const seen = new Set(), sws = [];
    for (const c of all) { const lc = c.toLowerCase(); if (seen.has(lc)) continue; seen.add(lc); const b = h('button', { class: 'lc-sw', 'aria-label': '线路颜色 ' + c, style: { background: c }, onclick: function () { pick(c); } }); b.dataset.c = lc; sws.push(b); box.appendChild(b); }
    const custom = h('input', { type: 'color', class: 'lc-picker', value: /^#[0-9a-f]{6}$/i.test(L.color) ? L.color : '#000000', 'aria-label': '自定义颜色', onchange: function () { const c = custom.value.toLowerCase(); const rc = (CM.Settings.get('recentColors') || []).filter(function (x) { return x !== c; }); rc.unshift(c); CM.Settings.set('recentColors', rc.slice(0, 8)); pick(c); } });
    const mark = function () { const c = String((net().lines[lid] || L).color).toLowerCase(); for (const b of sws) b.classList.toggle('on', b.dataset.c === c); };
    mark();
    openPop(anchor, L.name + ' 的颜色', h('div', null, box, h('label', { class: 'btn sm lc-custom', style: { marginTop: '6px' } }, custom, ic('pencil', 14), '自定义')));
  }
  // 商业开发与车站装修气泡：与车站详情页共用控件，操作后原地刷新
  function popPanel(id, anchor, title, build) {
    const s = net().stations[id]; if (!s) return;
    const body = h('div', { class: 'qpop-panel' });
    const fill = function () { body.replaceChildren(build(function () { fill(); key = ''; render(); })); if (CM.I18n) CM.I18n.localize(body); };
    fill();
    openPop(anchor, s.name + ' · ' + title, body);
  }
  function popTod(id, anchor) { popPanel(id, anchor, '商业开发', function (after) { return ui.todBody(id, after); }); }
  function popDecor(id, anchor) { popPanel(id, anchor, '车站装修', function (after) { return ui.decorBody(id, after); }); }
  function drawRows(sid) {
    const n = net(), rows = [];
    for (const lid of M.stationLines(n, sid)) {
      const tp = M.lineTopo(n, lid), L = n.lines[lid];
      if (tp.topo === 'loop' || tp.topo === 'invalid' || !tp.adj || !tp.adj.get(sid)) continue;
      const branch = tp.adj.get(sid).length >= 2;
      rows.push([L, branch ? '画 ' + L.name + ' 支线' : '延长 ' + L.name, function () { closePop(); ui.startDraw(sid, lid, branch); }]);
    }
    rows.push([null, '新建一条线路', function () { closePop(); ui.startDraw(sid, 'new'); }]);
    return rows;
  }
  function listBody(rows) {
    const b = h('div', { class: 'qpop-list' });
    for (const r of rows) b.appendChild(h('button', { class: 'qpop-row' + (r[3] ? ' danger' : ''), disabled: r[4] ? true : null, onclick: r[2] }, r[0] ? h('span', { class: 'dot', style: { background: AX.line(r[0]) } }) : ic('plus', 14), h('span', { class: 'grow' }, r[1]), r[5] ? h('span', { class: 'tiny muted' }, r[5]) : null));
    return b;
  }
  function popDraw(sid, anchor) {
    const rows = drawRows(sid);
    if (rows.length === 1) { rows[0][2](); return; }
    openPop(anchor, '从这里绘线', listBody(rows));
  }
  function doSplit(sid, lid) {
    const g = game(), n = net(), L = n.lines[lid], st = n.stations[sid];
    const r = g.edit(function (x) { return M.splitLineAt(x, lid, sid); });
    if (r.error) { ui.toast(r.error, 'bad'); return; }
    closePop();
    ui.toast('已在「' + st.name + '」拆开 ' + L.name + '（新线路可改名、改色），确认建设后生效', 'info');
  }
  function popSplit(sid, lids, anchor) {
    if (lids.length === 1) { doSplit(sid, lids[0]); return; }
    const n = net();
    openPop(anchor, '在此拆开哪条线？', listBody(lids.map(function (lid) { return [n.lines[lid], '拆开 ' + n.lines[lid].name, function () { doSplit(sid, lid); }]; })));
  }
  function popExtend(lid, anchor) {
    const n = net(), tp = M.lineTopo(n, lid);
    if (tp.topo !== 'path' && tp.topo !== 'branch') { ui.toast(tp.topo === 'loop' ? '环线不能延长' : '这条线路暂时不能延长', 'info'); return; }
    const rows = tp.leaves.map(function (sid) { return [n.lines[lid], '从「' + n.stations[sid].name + '」延长', function () { closePop(); ui.startDraw(sid, lid, false); }]; });
    openPop(anchor, '延长 ' + n.lines[lid].name, listBody(rows));
  }
  // 线路组织：贯通（并入本线）、在中间站拆开、支线转为独立线路
  function popOrg(lid, anchor) {
    const g = game(), n = net(), L = n.lines[lid], tp = M.lineTopo(n, lid), body = h('div');
    const others = Object.keys(n.lines).filter(function (o) { return o !== lid && M.sharedStations(n, lid, o).length; });
    if (others.length) {
      body.appendChild(h('div', { class: 'qpop-k' }, '贯通：把另一条线并入本线'));
      body.appendChild(listBody(others.map(function (o) {
        const trial = M.mergeLines(M.clone(n), lid, o);
        return [n.lines[o], '并入 ' + n.lines[o].name, function () {
          const r = g.edit(function (x) { return M.mergeLines(x, lid, o); });
          if (r.error) { ui.toast(r.error, 'bad'); return; }
          closePop(); ui.toast(r.other + ' 已并入 ' + r.name + '，确认建设后生效', 'info');
        }, false, !!trial.error, trial.error ? '不能贯通' : M.TOPO_NAME[trial.topo]];
      })));
    }
    if (tp.topo === 'path' || tp.topo === 'branch') {
      const mids = tp.stations.filter(function (sid) { return tp.adj.get(sid).length >= 2; });
      if (mids.length) {
        const order = tp.routes.length ? tp.routes[0].st.concat(tp.routes.slice(1).map(function (r) { return r.st; }).reduce(function (a, b) { return a.concat(b); }, [])) : mids;
        const seen = new Set(), sel = h('select', { 'aria-label': '拆开的车站' });
        for (const sid of order) if (mids.indexOf(sid) >= 0 && !seen.has(sid)) { seen.add(sid); sel.appendChild(h('option', { value: sid }, n.stations[sid].name)); }
        body.appendChild(h('div', { class: 'qpop-k' }, '在车站拆开成两条线'));
        body.appendChild(h('div', { class: 'row' }, sel, h('button', { class: 'btn sm', onclick: function () { doSplit(sel.value, lid); } }, ic('scissors', 14), '拆开')));
      }
    }
    if (tp.topo === 'branch') {
      body.appendChild(h('div', { class: 'qpop-k' }, '支线转为独立线路'));
      body.appendChild(listBody(tp.leaves.filter(function (sid) { return sid !== tp.root; }).map(function (leaf) {
        return [L, '往 ' + n.stations[leaf].name, function () {
          const r = g.edit(function (x) { return M.detachBranch(x, lid, leaf); });
          if (r.error) { ui.toast(r.error, 'bad'); return; }
          closePop(); ui.toast('已拆出 ' + net().lines[r.line].name + '，确认建设后生效', 'info');
        }];
      })));
    }
    if (!body.childNodes.length) body.appendChild(h('div', { class: 'tiny muted' }, '本线没有可贯通的线路，也没有中间站可拆开。先把线路延长到另一条线的车站，就能贯通。'));
    body.appendChild(h('div', { class: 'tiny muted', style: { marginTop: '6px' } }, '只改运营组织，不改轨道、不收费；进入草案，确认后生效。'));
    openPop(anchor, L.name + '：贯通与拆开', body);
  }
  function popSeg(segId, anchor) {
    const g = game(), n = net(), sg = n.segments[segId]; if (!sg) return;
    const geo = M.segGeom(n, sg, g.city), body = h('div');
    const tc = h('div', { class: 'seg-ctl' });
    for (const t of ['underground', 'surface', 'elevated']) tc.appendChild(h('button', { class: sg.type === t ? 'on' : '', 'data-tip': '约 ' + U.fmtMoney(M.trackCost(geo, t, g.clock.y)), onclick: function () { const c = net().segments[segId]; if (c && c.type !== t) g.edit(function (x) { const s2 = x.segments[segId], co = M.coTrackSegs(x, s2); s2.type = t; M.syncCoTrack(x, s2, co); }); closePop(); } }, CFG.metro.typeName[t]));
    const cc = h('div', { class: 'seg-ctl' });
    for (const cv of [['smooth', '平滑'], ['pass', '穿点']]) cc.appendChild(h('button', { class: (sg.curve === 'smooth') === (cv[0] === 'smooth') ? 'on' : '', onclick: function () { const c = net().segments[segId]; if (c && (c.curve === 'smooth') !== (cv[0] === 'smooth')) g.edit(function (x) { const s2 = x.segments[segId], co = M.coTrackSegs(x, s2); if (cv[0] === 'smooth') s2.curve = 'smooth'; else delete s2.curve; M.syncCoTrack(x, s2, co); }); closePop(); } }, cv[1]));
    body.append(h('div', { class: 'qpop-k' }, '建设方式（改建按新建计费）'), tc, h('div', { class: 'qpop-k' }, '线形'), cc,
      h('button', { class: 'btn sm', style: { marginTop: '8px' }, onclick: function () { closePop(); ui.tools.setTool('edit'); ui.select({ kind: 'seg', id: segId }); ui.toast('拖动圆点调整线形，拖动菱形增加转弯点', 'info'); } }, ic('pencil', 14), '拖动调整线形'));
    openPop(anchor, n.stations[sg.a].name + '—' + n.stations[sg.b].name, body);
  }
  function popDemolish(segId, anchor) {
    const g = game(), n = net(), sg = n.segments[segId]; if (!sg) return;
    const lid = sg.line, L = n.lines[lid];
    openPop(anchor, '拆除', listBody([
      [L, '拆除这一段（' + n.stations[sg.a].name + '—' + n.stations[sg.b].name + '）', function () { closePop(); ui.demolish({ kind: 'seg', id: segId }); }, true],
      [L, '拆除整条 ' + L.name + '（车站保留）', function () { closePop(); g.edit(function (x) { for (const s of M.lineSegs(x, lid)) delete x.segments[s.id]; delete x.lines[lid]; }); ui.select(null); ui.toast('已在草案中拆除 ' + L.name + ' 全部轨道', 'info'); }, true],
    ]));
  }
  Q.popTod = popTod; Q.popDecor = popDecor;   // 财政页「车站商业」列表也直接打开商业开发气泡
  Q.popColor = popColor;   // 线路详情标题前的彩色徽标也打开调色气泡
})(window.CM);
