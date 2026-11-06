'use strict';
// 地铁芯（v2.5）：右下角满意度左边的线网管理系统，与「地铁圈」相呼应。集中管理全部线路与车站（基本信息、改名改色、运行速度与交路、列车运营、
// 站台规模、车站商业、装修），列车与过载提醒也在这里；绘线、建站仍在地图上完成。改动沿用原有规则：名称颜色立即生效，建设类进入草案。
// 过载提醒：线路或车站连续两个月明显过载时，在入口上方出现一张小卡片，可以自动处理或定位后手动处理；不打断游戏，也不连续弹出。
(function (CM) {
  const U = CM.U, CFG = CM.CFG, h = U.h, M = CM.Metro, AX = CM.Accessibility;
  const ic = function (n, s) { return CM.icon(n, s); };
  const sfx = function (n) { if (CM.Sound) CM.Sound.play(n); };
  const sizeNext = { S: 'M', M: 'L' };

  // ======================== 过载提醒 ========================
  const A = CM.OpsAlerts = {};
  const LIMIT = { warn: 1.1, bad: 1.4 }, STREAK = 2, POP_GAP = 3, SNOOZE = 12, AFTER_FIX = 6;   // 满载或负荷阈值、持续月数、两次弹出的最短间隔（月）、点「×」与处理后的静默月数
  const note = function (g) { return g.opsNote || (g.opsNote = { streak: {}, snooze: {}, lastPop: 0 }); };
  // 当前过载的线路与车站（工作日早高峰已发布结果），按严重程度排序
  A.scan = function (g) {
    const m = g.model, net = m.net; if (!net || !net.R || !m.trafficReady() || !CM.Tasks) return [];
    const out = [], C = net.C;
    for (const x of CM.Tasks.crowdOf(g)) {
      const L = g.net.lines[x.lid]; if (!L || x.lf < LIMIT.warn) continue;
      const a = C.stations[x.a], b = C.stations[x.b];
      out.push({ key: 'l:' + x.lid, kind: 'line', id: x.lid, value: x.lf, level: x.lf >= LIMIT.bad ? 'bad' : 'warn', name: L.name, what: '早高峰满载 ' + U.fmtPct(x.lf, 0), title: L.name + ' 早高峰满载 ' + U.fmtPct(x.lf, 0), sub: a && b ? '最拥挤：' + a.name + '—' + b.name : '' });
    }
    const sd = m.stDailyWk || m.stDaily;
    if (sd && !m.dailyStale) C.stations.forEach(function (s, i) {
      if (!C.serviced[i] || i >= sd.peak.length) return;
      const r = sd.peak[i] / CFG.metro.stationCap[s.size]; if (r < LIMIT.warn) return;
      out.push({ key: 's:' + s.id, kind: 'station', id: s.id, value: r, level: r >= LIMIT.bad ? 'bad' : 'warn', name: s.name, what: '高峰负荷 ' + U.fmtPct(r, 0), title: s.name + ' 站高峰负荷 ' + U.fmtPct(r, 0), sub: CFG.metro.sizeName[s.size] + '车站 · 约 ' + U.fmtInt(sd.peak[i]) + ' 人次/时' });
    });
    return out.sort(function (a, b) { return b.value - a.value; });
  };
  // 已持续过载、未被静默的项目（入口角标与 App 的提醒页）
  A.active = function (g) {
    const n = note(g), ym = g.ym();
    return A.scan(g).filter(function (x) { return (n.streak[x.key] || 0) >= STREAK && !(n.snooze[x.key] > ym); });
  };
  // 每月一次（当月交通结果发布后）：更新持续月数，只在间隔足够、界面空闲时弹出一张最严重的卡片
  A.monthly = function (g, ui) {
    if (g.tutorial) return;
    const n = note(g), ym = g.ym();
    if (n.ym === ym) { ui.updateOpsDock(); return; }   // 读档后同一个月不重复计数
    n.ym = ym;
    const now = A.scan(g), cur = {};
    for (const x of now) cur[x.key] = (n.streak[x.key] || 0) + 1;
    n.streak = cur;
    ui.updateOpsDock();
    if (ui.blocking() || ui.opsApp || ui.voApp || CM.Settings.get('opsPop') === false || ym - (n.lastPop || 0) < POP_GAP) return;
    const list = A.active(g); if (!list.length) return;
    n.lastPop = ym;
    ui.showOpsPop(list[0]);
  };
  // 自动处理方案（只读）：线路先用车辆段闲置列车、再买车补足高峰所需；手动调度改回智能调度；频率到顶时升级限制编组的车站。
  // 车站升级一级。返回 { ok, steps, cost, text }，不能自动解决时 ok 为 false 并说明原因
  A.plan = function (g, x) {
    const F = CM.Fleet, y = g.clock.y, steps = [];
    let cost = 0;
    const station = function (s) { const nx = sizeNext[s.size]; return nx ? (M.stationCost(s.type, nx, y) - M.stationCost(s.type, s.size, y)) * 1.2 : 0; };
    if (x.kind === 'station') {
      const s = g.net.stations[x.id]; if (!s) return { ok: false, text: '车站已不存在' };
      if (!sizeNext[s.size]) return { ok: false, text: '已是大型车站：需要分流，例如修平行线路或站外换乘' };
      cost = station(s);
      return { ok: true, steps: [{ type: 'upgrade', ids: [s.id] }], cost: cost, text: '升级为' + CFG.metro.sizeName[sizeNext[s.size]] + '车站' };
    }
    const lid = x.id, L = g.net.lines[lid]; if (!L || !g.fleet) return { ok: false, text: '线路已不存在' };
    const o = g.fleet.ops[lid], info = F.lineInfo(g, lid) || [], parts = [];
    if (o && o.mode === 'manual') { steps.push({ type: 'auto', line: lid }); parts.push('改为智能调度'); }
    const idle = g.fleet.trains.filter(function (t) { return !t.line; });
    let moved = 0, bought = 0;
    for (const s of info) {
      let short = Math.max(0, s.peakNeed - s.avail); if (short <= 0) continue;
      const use = [];
      for (let i = idle.length - 1; i >= 0 && short > 0; i--) { const t = idle[i], need = s.rt.kmh > 80 ? s.rt.kmh : 0; if (t.cars <= s.rt.cars && F.model(t.model).kmh >= need) { use.push(t.id); idle.splice(i, 1); short--; } }
      if (use.length) { steps.push({ type: 'move', ids: use, line: lid, svc: s.id }); moved += use.length; }
      if (short > 0) {
        const m = F.recommend(g.mapId, y, s.rt.kmh), cars = Math.min(s.rt.cars, m.max), each = F.price(g, m, cars, y);
        steps.push({ type: 'buy', line: lid, svc: s.id, model: m.id, cars: cars, n: short, name: F.shortOf(m) });
        cost += each * short; bought += short;
      }
    }
    if (moved) parts.push('调入闲置列车 ' + moved + ' 列');
    if (bought) parts.push('购买列车 ' + bought + ' 列');
    // 列车够用仍过载：频率已到上限，只能靠加长编组（升级限制编组的车站）
    if (!moved && !bought) {
      const C = g.compiled, rts = C.routes.filter(function (r) { return r.lineId === lid && !r.svc; }), min = rts.reduce(function (a, r) { return Math.min(a, r.cars); }, 8);
      if (min < 8) {
        const ids = []; for (const r of rts) if (r.cars === min) for (const sid of r.stIds) { const s = g.net.stations[sid]; if (s && CFG.metro.carsBySize[s.size] === min && ids.indexOf(sid) < 0) ids.push(sid); }
        for (const sid of ids) cost += station(g.net.stations[sid]);
        steps.push({ type: 'upgrade', ids: ids }); parts.push('升级 ' + ids.length + ' 座车站以加长编组');
      }
    }
    if (!steps.length) return { ok: false, text: '发车频率与编组都到上限：需要分流，例如修平行线路或加开交路' };
    return { ok: true, steps: steps, cost: cost, text: parts.join('，') };
  };
  A.affordable = function (g, plan) { return g.econ.isFree() || g.econ.canAffordBuild(plan.cost); };
  // 执行方案；车站升级走建设流程：没有其他草案时直接确认，已有草案时并入草案由玩家确认
  A.run = function (g, ui, x) {
    const plan = A.plan(g, x), F = CM.Fleet; if (!plan.ok) return { error: plan.text };
    if (!A.affordable(g, plan)) return { error: '资金不足：需要约 ' + U.fmtMoney(plan.cost) };
    let drafted = false;
    for (const st of plan.steps) {
      if (st.type === 'auto') F.setMode(g, st.line, 'auto');
      else if (st.type === 'move') F.move(g, st.ids, st.line, st.svc);
      else if (st.type === 'buy') { const r = F.buy(g, st.line, st.svc, st.model, st.cars, st.n); if (r.error) return r; }
      else if (st.type === 'upgrade') {
        const had = !!g.draft, r = g.edit(function (n) { for (const id of st.ids) { const s = n.stations[id]; if (s && sizeNext[s.size]) s.size = sizeNext[s.size]; } });
        if (r.error) return r;
        if (had) drafted = true;
        else { const c = g.canConfirm(); if (c.ok) g.confirmDraft(); else drafted = true; }
      }
    }
    const n = note(g); n.snooze[x.key] = g.ym() + AFTER_FIX; n.streak[x.key] = 0;
    g.logEvent({ tag: '运营', title: '自动处理：' + x.title, desc: plan.text + (plan.cost > 0.5 ? '，约 ' + U.fmtMoney(plan.cost) : '') + '。' });
    ui.markUnsaved(); ui.scheduleAutosave(); ui.updateOpsDock();
    return { ok: true, drafted: drafted, text: plan.text };
  };
  // 定位后手动处理：地图移到对象处，打开对应详情（线路进「列车运营」分页，车站进「概况」看拥挤诊断）
  A.locate = function (g, ui, x) {
    if (x.kind === 'station') { const s = g.net.stations[x.id]; if (!s) return; ui.flyTo(s.x, s.y); ui.openObj('station', x.id, 'info'); return; }
    const tp = M.lineTopo(g.net, x.id), ss = (tp.stations || []).map(function (sid) { return g.net.stations[sid]; }).filter(Boolean);
    if (ss.length) { let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9; for (const s of ss) { x0 = Math.min(x0, s.x); y0 = Math.min(y0, s.y); x1 = Math.max(x1, s.x); y1 = Math.max(y1, s.y); } ui.fitBox(x0 - 3, y0 - 3, x1 + 3, y1 + 3, 22); }
    ui.openObj('line', x.id, g.fleet ? 'ops' : 'info');
  };
  A.snooze = function (g, ui, x) { note(g).snooze[x.key] = g.ym() + SNOOZE; ui.markUnsaved(); ui.updateOpsDock(); };

  // ======================== 月度记录与改造效果 ========================
  // 只读模拟结果，不影响模拟。每月记下各线路、车站的指标（趋势图用）；线路或车站的配置变化时，把变化和改造前的指标记入改造记录，之后用当前指标对比
  const KEEP_L = 60, KEEP_S = 18, KEEP_LOG = 40;
  const trainCount = function (g) { const c = {}; if (g.fleet) for (const t of g.fleet.trains) if (t.line) c[t.line] = (c[t.line] || 0) + 1; return c; };
  const lineSig = function (g, lid, count) {
    const L = g.net.lines[lid], tp = M.lineTopo(g.net, lid); let km = 0;
    // 编译结果里已有区段几何（v2.6：以前每月为每条线重算一遍几何，线路多时一次要半秒）
    for (const sg of M.lineSegs(g.net, lid)) { const cs = g.compiled && g.compiled.segs.get(sg.id); km += (cs ? cs.g : M.segGeom(g.net, sg, g.city)).lenM / 1000; }
    return { v: M.lineKmh(L), sv: (L.svcs || []).length + 1, tr: count[lid] || 0, st: (tp.stations || []).length, km: Math.round(km * 10) / 10 };
  };
  const stationSig = function (s) { return { z: s.size, t: s.tod || 0 }; };
  const diffSig = function (a, b) { const out = []; if (a) for (const k in b) if (a[k] !== b[k]) out.push([k, a[k], b[k]]); return out; };
  const tripOf = function (rt) { return rt && rt.legSec ? Math.round(Array.prototype.reduce.call(rt.legSec, function (a, v) { return a + v; }, 0) / 6) : 0; };   // 单程用时（0.1 分钟）
  // 线路当前指标：[日客运量, 高峰满载 %, 高峰间隔（0.1 分钟）, 单程用时（0.1 分钟）, 高峰运力（人次/时）]
  const lineNow = function (g) {
    const out = {}, stats = CM.Tasks.lineStats(g), crowd = new Map();
    for (const x of CM.Tasks.crowdOf(g)) crowd.set(x.lid, x.lf);
    for (const lid in g.net.lines) {
      const info = CM.Fleet && g.fleet ? (CM.Fleet.lineInfo(g, lid) || []) : [], main = info.find(function (x) { return !x.svc; }) || info[0], P = main && main.per && main.per[0], s = stats.get(lid);
      out[lid] = [Math.round(s ? s.riders : 0), Math.round((crowd.get(lid) || 0) * 100), P && P.f > 0 ? Math.round(600 / P.f) : 0, tripOf(main && main.rt), P ? Math.round(P.capH) : 0];
    }
    return out;
  };
  // 车站当前指标：[日客流, 高峰负荷 %]
  const stationNow = function (g) {
    const out = {}, C = g.model.net ? g.model.net.C : g.compiled, sd = g.model.dailyStale ? null : g.model.stDailyWk || g.model.stDaily; if (!sd) return out;
    for (const sid in g.net.stations) { const k = C.sIndex.get(sid); if (k !== undefined && k < sd.peak.length) out[sid] = [Math.round(sd.inn[k] + sd.out[k] + sd.xfer[k]), Math.round(sd.peak[k] / CFG.metro.stationCap[g.net.stations[sid].size] * 100)]; }
    return out;
  };
  // 每月一次（当月交通结果可用时）
  A.record = function (g) {
    if (!CM.Tasks || !g.model.trafficReady()) return;
    const n = note(g), ym = g.ym(); if (n.recYm === ym) return; n.recYm = ym;
    const T = n.trend || (n.trend = { l: {}, s: {} }), S = n.sig || (n.sig = { l: {}, s: {} }), log = n.log || (n.log = []), count = trainCount(g), lm = lineNow(g), sm = stationNow(g);
    const put = function (k, id, sig, vals, keep) {
      const arr = T[k][id] || (T[k][id] = []), ch = diffSig(S[k][id], sig);
      if (ch.length && arr.length) log.push({ ym: ym, k: k, id: id, ch: ch, b: arr[arr.length - 1] });
      S[k][id] = sig; arr.push([ym].concat(vals));
      if (arr.length > keep) arr.shift();
    };
    M.withSegIndex([g.net], function () { for (const lid in g.net.lines) put('l', lid, lineSig(g, lid, count), lm[lid] || [0, 0, 0, 0, 0], KEEP_L); });
    for (const sid in g.net.stations) put('s', sid, stationSig(g.net.stations[sid]), sm[sid] || [0, 0], KEEP_S);
    for (const k of ['l', 's']) { const live = k === 'l' ? g.net.lines : g.net.stations; for (const id in T[k]) if (!live[id]) { delete T[k][id]; delete S[k][id]; } }
    while (log.length > KEEP_LOG) log.shift();
  };
  A.rows = function (g, k, id) { const T = note(g).trend; return (T && T[k][id]) || []; };
  A.logOf = function (g, k, id) { return (note(g).log || []).filter(function (e) { return e.k === k && e.id === id; }); };
  // 上次记录之后的改动（还没有客流结果）
  A.pending = function (g, k, id) {
    const S = note(g).sig; if (!S || !S[k][id]) return [];
    return diffSig(S[k][id], k === 'l' ? lineSig(g, id, trainCount(g)) : stationSig(g.net.stations[id]));
  };
  A.changeText = function (c) {
    const a = c[1], b = c[2], lv = function (v) { return v ? '第 ' + v + ' 级' : '未开发'; };
    if (c[0] === 'v') return '运行速度 ' + a + ' → ' + b + ' km/h';
    if (c[0] === 'sv') return '交路 ' + a + ' → ' + b + ' 个';
    if (c[0] === 'tr') return '列车 ' + a + ' → ' + b + ' 列';
    if (c[0] === 'st') return '车站 ' + a + ' → ' + b + ' 座';
    if (c[0] === 'km') return '长度 ' + a + ' → ' + b + ' km';
    if (c[0] === 'z') return '规模 ' + CFG.metro.sizeName[a] + ' → ' + CFG.metro.sizeName[b];
    return '商业开发 ' + lv(a) + ' → ' + lv(b);
  };
  const tenth = function (v) { return (v / 10).toFixed(1) + ' 分钟'; }, percent = function (v) { return v + '%'; };
  const METRICS = {
    l: [{ i: 1, label: '日客运量', up: true, fmt: U.fmtPeople }, { i: 2, label: '高峰满载', fmt: percent }, { i: 3, label: '高峰间隔', fmt: tenth }, { i: 4, label: '单程用时', fmt: tenth }, { i: 5, label: '高峰运力', up: true, fmt: function (v) { return U.fmtInt(v) + ' 人次/时'; } }],
    s: [{ i: 1, label: '日客流', up: true, fmt: U.fmtPeople }, { i: 2, label: '高峰负荷', fmt: percent }],
  };

  // 提醒的两个动作（卡片与 App 共用）
  const actions = function (ui, g, x, after) {
    const plan = A.plan(g, x), can = plan.ok && A.affordable(g, plan);
    const tip = plan.ok ? plan.text + (plan.cost > 0.5 ? '，约 ' + U.fmtMoney(plan.cost) : '') + (can ? '' : '（资金不足）') : plan.text;
    return h('div', { class: 'ops-acts' },
      h('button', { class: 'btn sm primary', disabled: can ? null : true, 'data-tip': tip, onclick: function () {
        const r = A.run(g, ui, x);
        if (r.error) { ui.toast(r.error, 'bad'); return; }
        sfx(r.drafted ? 'soft' : 'opsFix');
        ui.toast(r.drafted ? '已放入草案，确认建设后生效：' + r.text : '已处理：' + r.text, r.drafted ? 'info' : 'good');
        if (after) after('auto');
      } }, ic('sparkle', 13), '自动处理', plan.ok && plan.cost > 0.5 ? h('em', { class: 'ops-cost' }, U.fmtMoney(plan.cost)) : null),
      h('button', { class: 'btn sm', onclick: function () { if (after) after('locate'); A.locate(g, ui, x); } }, ic('locate', 13), '定位处理'));
  };
  CM.UI.prototype.hideOpsPop = function () { if (this._opsPop) { this._opsPop.remove(); this._opsPop = null; } clearTimeout(this._opsPopT); };
  CM.UI.prototype.showOpsPop = function (x) {
    const g = this.g(), self = this; if (!g) return;
    this.hideOpsPop();
    const close = function () { self.hideOpsPop(); };
    const hold = function (on) { clearTimeout(self._opsPopT); if (!on) self._opsPopT = setTimeout(close, 16000); };
    const plan = A.plan(g, x);
    const pop = h('div', { class: 'ops-pop ' + x.level, role: 'status', 'aria-live': 'polite' },
      h('div', { class: 'ops-pop-h' }, h('span', { class: 'ops-pop-i' }, ic('chip', 15)), h('small', { class: 'grow' }, '地铁芯'),
        h('button', { class: 'iconbtn', 'aria-label': '暂不提醒', 'data-tip': '一年内不再提醒这一项', onclick: function () { A.snooze(g, self, x); close(); } }, ic('close', 13))),
      h('b', { class: 'ops-pop-t' }, x.title),
      h('div', { class: 'tiny muted' }, x.sub), h('div', { class: 'tiny ops-pop-plan' }, plan.ok ? '可以' + plan.text : plan.text),
      actions(this, g, x, close));
    pop.addEventListener('pointerenter', function () { hold(true); });
    pop.addEventListener('pointerleave', function () { hold(false); });
    this._opsPop = pop;
    document.getElementById('app').appendChild(pop);
    this.queueLayout();
    hold(false);
    sfx('opsAlert');
  };
  // 随界面刷新调用：换月且当月交通结果已发布时做一次月度检查，打开的 App 随之刷新
  CM.UI.prototype.tickOps = function (g) {
    const ym = g.ym();
    if (this._opsYm === ym && this._opsG === g) return;
    if (g.jumping || g.pending || !g.model.trafficReady()) return;
    this._opsYm = ym; this._opsG = g;
    try { A.record(g); A.monthly(g, this); } catch (e) { console.error(e); }
    if (this.opsApp) this.opsApp.refresh();
  };
  // 入口角标：需要关注的项目数
  CM.UI.prototype.updateOpsDock = function () {
    const b = this.opsDock, g = this.g(); if (!b || !g) return;
    const n = g.tutorial ? 0 : A.active(g).length, dot = b.querySelector('.sd-dot');
    if (b._n !== n) { b._n = n; dot.textContent = n ? String(n) : ''; dot.style.display = n ? '' : 'none'; }
    const onV = b.querySelector('.sd-v'), nl = Object.keys(g.net.lines).length + ' 线';
    if (onV._t !== nl) { onV._t = nl; onV.textContent = nl; }
  };

  // ======================== 地铁芯 App ========================
  // 线网管理系统。窗口尺寸与开合动画同「地铁圈」；左侧四个模块：总览（指标、待处理事项、负荷排行）、线路管理与车站管理（可筛选、搜索、排序的数据表）、列车管理。
  // 点表格的一行进入详情页，详情页按分页管理，左上角返回。建设类改动汇总在底部的草案栏
  const PAGE = 50, ROOT_OF = { line: 'lines', station: 'stations' }, SIZE_ORDER = { S: 1, M: 2, L: 3 };
  const pctText = function (v) { return v > 9.99 ? '>999%' : U.fmtPct(v, 0); };
  const loadCls = function (v) { return v > 1 ? 'bad' : (v > 0.85 ? 'warn' : ''); };
  const loadBar = function (v) { return h('div', { class: 'mc-load ' + loadCls(v) }, h('i', null, h('em', { style: { width: (Math.min(1.5, Math.max(0, v)) / 1.5 * 100).toFixed(1) + '%' } })), h('span', null, pctText(v))); };
  const tag = function (s) { return s ? h('span', { class: 'mc-tag ' + s[0] }, s[1]) : null; };
  const lineState = function (r) { return r.lf >= LIMIT.warn ? ['bad', '过载'] : (r.need > r.avail ? ['warn', '缺车'] : (r.lf > 1 ? ['warn', '满载'] : (r.lf > 0.85 ? ['warn', '接近满载'] : ['good', '正常']))); };
  const stationState = function (r) { return !r.live ? ['', '未运营'] : (r.load >= LIMIT.warn ? ['bad', '过载'] : (r.load > 1 ? ['warn', '满载'] : (r.load > 0.85 ? ['warn', '接近满载'] : ['good', '正常']))); };
  // ---------------- 图表 ----------------
  const ymText = function (ym) { return Math.floor(ym / 12) + '年' + (ym % 12 + 1) + '月'; };
  const esc = function (s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  const niceMax = function (v) { if (!(v > 0)) return 1; const p = Math.pow(10, Math.floor(Math.log10(v))), n = v / p; return (n <= 1 ? 1 : (n <= 2 ? 2 : (n <= 5 ? 5 : 10))) * p; };
  const local = function (s) { return CM.I18n ? CM.I18n.text(s) : s; };
  // 趋势图：一张图一个指标（不用双轴），y 轴从 0 开始；悬停显示当月数值，竖虚线标出改造的月份。pts：[[年月序号, 数值], …]
  const trendChart = function (pts, o) {
    if (pts.length < 2) return h('div', { class: 'mc-none' }, '记录满两个月后显示趋势');
    const W = 520, H = 120, x0 = pts[0][0], x1 = pts[pts.length - 1][0], mx = niceMax(Math.max.apply(null, pts.map(function (p) { return p[1]; }).concat(o.ref || 0)));
    const X = function (ym) { return (ym - x0) / Math.max(1, x1 - x0); }, Y = function (v) { return 1 - v / mx * 0.94; };
    const coords = pts.map(function (p) { return (X(p[0]) * W).toFixed(1) + ',' + (Y(p[1]) * H).toFixed(1); }).join(' ');
    let svg = '<svg viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none" aria-hidden="true">';
    for (const f of [0, 0.5, 1]) svg += '<line class="mc-grid" x1="0" x2="' + W + '" y1="' + (Y(mx * f) * H).toFixed(1) + '" y2="' + (Y(mx * f) * H).toFixed(1) + '"/>';
    if (o.ref) svg += '<line class="mc-ref" x1="0" x2="' + W + '" y1="' + (Y(o.ref) * H).toFixed(1) + '" y2="' + (Y(o.ref) * H).toFixed(1) + '"/>';
    for (const m of o.marks || []) if (m >= x0 && m <= x1) svg += '<line class="mc-mark" x1="' + (X(m) * W).toFixed(1) + '" x2="' + (X(m) * W).toFixed(1) + '" y1="0" y2="' + H + '"/>';
    svg += '<polygon class="mc-area" points="0,' + H + ' ' + coords + ' ' + W + ',' + H + '"/><polyline class="mc-line" points="' + coords + '"/></svg>';
    const last = pts[pts.length - 1], dot = h('i', { class: 'mc-dot', style: { left: '100%', top: (Y(last[1]) * 100).toFixed(1) + '%' } }), cross = h('i', { class: 'mc-cross', style: { display: 'none' } }), tip = h('div', { class: 'mc-tip', style: { display: 'none' } });
    const plot = h('div', { class: 'mc-plot', html: svg }); plot.append(cross, dot, tip);
    plot.addEventListener('pointermove', function (e) {
      const r = plot.getBoundingClientRect(), ym = x0 + (e.clientX - r.left) / r.width * (x1 - x0);
      let p = pts[0]; for (const q of pts) if (Math.abs(q[0] - ym) < Math.abs(p[0] - ym)) p = q;
      const px = X(p[0]) * 100, py = Y(p[1]) * 100, marked = (o.marks || []).indexOf(p[0]) >= 0;
      cross.style.display = ''; cross.style.left = px + '%'; dot.style.left = px + '%'; dot.style.top = py + '%';
      tip.style.display = ''; tip.style.left = Math.min(72, px) + '%'; tip.style.top = Math.max(0, py - 26) + '%';
      tip.textContent = local(ymText(p[0])) + ' · ' + local(o.fmt(p[1])) + (marked ? ' · ' + local('改造') : '');
    });
    plot.addEventListener('pointerleave', function () { cross.style.display = 'none'; tip.style.display = 'none'; dot.style.left = '100%'; dot.style.top = (Y(last[1]) * 100).toFixed(1) + '%'; });
    return h('div', { class: 'mc-chart', style: null },
      h('div', { class: 'mc-yax' }, [mx, mx / 2, 0].map(function (v) { return h('span', null, v ? o.fmt(v) : '0'); })), plot,
      h('div', { class: 'mc-xax' }, h('span', null, ymText(x0)), o.ref ? h('span', { class: 'mc-reflb' }, o.refLabel || '') : null, h('span', null, ymText(x1))));
  };
  // 表格里的小趋势线
  const sparkLine = function (rows, i) {
    if (rows.length < 2) return null;
    const list = rows.slice(-24), mx = Math.max(1, Math.max.apply(null, list.map(function (r) { return r[i]; }))), pts = list.map(function (r, k) { return (k / (list.length - 1) * 60).toFixed(1) + ',' + (17 - r[i] / mx * 15).toFixed(1); }).join(' ');
    return h('span', { class: 'mc-spark', 'aria-hidden': 'true', html: '<svg viewBox="0 0 60 18" width="60" height="18"><polyline points="' + pts + '"/></svg>' });
  };
  // 较上月的变化：箭头加文字，不只靠颜色（up：上升算好）
  const deltaEl = function (now, prev, up) {
    if (!(prev > 0) || Math.abs(now - prev) / prev < 0.005) return '与上月持平';
    const rise = now > prev, good = up == null ? '' : (rise === up ? ' good' : ' bad');
    return h('em', { class: 'mc-delta' + good }, (rise ? '▲ ' : '▼ ') + U.fmtPct(Math.abs(now - prev) / prev, 1), ' 较上月');
  };
  // 车站示意图（剖面）：站台长度随规模变化，列车为可停靠的最长编组；站房按建筑风格和主题色（配色与地图上的站房一致），地面建筑随商业开发等级变化。
  // over：试看的装修选项或开发等级（鼠标移到选项上时预览，不改变存档）
  const ART_LOOK = {
    heritage: { wall: '#96705a', roof: '#4a4642', glass: '#607662', trim: '#2e5c46' },
    modern: { wall: '#9cc0dc', roof: '#e4e8ee', glass: '#b9d4ea', trim: '#8c96a2' },
    tech: { wall: '#eef2f6', roof: '#f8fafb', glass: '#bedef0', trim: '#7fd4f0' },
    garden: { wall: '#b0926c', roof: '#48604c', glass: '#84a080', trim: '#7a5c3c' },
    industrial: { wall: '#864c3a', roof: '#3e4248', glass: '#707c84', trim: '#5a6068' },
  };
  const SIGN_COL = { enamel: '#1c3a7c', neon: '#ff40a0', minimal: '#dfe4e9' };
  const stationArt = function (s, ls, over) {
    over = over || {};
    const dc = Object.assign({}, s.decor, over), line = ls[0] ? AX.line(ls[0]) : '#2b649c', band = dc.color || line, style = ART_LOOK[dc.style] ? dc.style : 'modern', K = ART_LOOK[style], tod = over.tod != null ? over.tod : (s.tod || 0);
    const cars = CFG.metro.carsBySize[s.size], under = s.type === 'underground', elev = s.type === 'elevated', W = 420, H = 170, g = under ? 86 : 152, plat = under ? 154 : (elev ? 104 : 148), carW = 32, full = 8 * carW + 20, x0 = (W - full) / 2, w = cars * carW + 20;
    const R = function (x, y, rw, rh, fill, rx) { return '<rect x="' + x + '" y="' + y + '" width="' + rw + '" height="' + rh + '" fill="' + fill + '"' + (rx ? ' rx="' + rx + '"' : '') + '/>'; };
    let o = '<svg class="st-art" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc(s.name) + '">';
    if (under) o += '<rect class="st-soil" x="0" y="' + g + '" width="' + W + '" height="' + (H - g) + '"/>';
    o += '<line class="st-ground" x1="0" x2="' + W + '" y1="' + g + '" y2="' + g + '"/>';
    // 地面商业：便利店与灯箱 → 商业街 → 站城一体
    if (tod >= 1) o += R(156, g - 15, 24, 15, '#f4c04e') + R(154, g - 19, 28, 4, band, 1) + R(187, g - 10, 2, 10, '#8c96a2') + R(183, g - 26, 10, 16, band, 1);
    if (tod >= 2) for (let k = 0; k < 4; k++) { const x = 198 + k * 22; o += R(x, g - 28, 20, 28, '#e8dcc8') + R(x + 3, g - 16, 14, 16, K.glass) + R(x - 1, g - 20, 22, 4, band); }
    if (tod >= 3) {
      o += R(292, g - 16, 112, 16, '#d6dce2');
      for (const t of [[304, 32, 66], [344, 26, 48], [376, 22, 30]]) { o += R(t[0], g - 16 - t[2], t[1], t[2], '#8fb4d4') + R(t[0], g - 19 - t[2], t[1], 3, band); for (let y = g - 16 - t[2] + 6; y < g - 18; y += 8) o += R(t[0] + 3, y, t[1] - 6, 2, '#ffffff66'); }
    }
    // 站房：屋顶与墙面随建筑风格
    const hx = 18;
    if (style === 'heritage') o += R(hx, g - 34, 92, 34, K.wall) + R(hx - 3, g - 38, 98, 5, K.roof) + R(hx - 3, g - 41, 98, 3, band) + '<path fill="' + K.trim + '" d="M' + (hx + 34) + ' ' + g + 'v-16a12 12 0 0 1 24 0v16z"/>' + R(hx + 10, g - 26, 12, 14, K.glass, 5) + R(hx + 70, g - 26, 12, 14, K.glass, 5);
    else if (style === 'tech') o += '<path fill="' + K.roof + '" class="st-shell" d="M' + (hx - 8) + ' ' + g + 'C' + (hx + 8) + ' ' + (g - 56) + ' ' + (hx + 84) + ' ' + (g - 56) + ' ' + (hx + 100) + ' ' + g + 'z"/><path fill="' + K.glass + '" d="M' + (hx + 8) + ' ' + g + 'C' + (hx + 20) + ' ' + (g - 34) + ' ' + (hx + 72) + ' ' + (g - 34) + ' ' + (hx + 84) + ' ' + g + 'z"/><path fill="none" stroke="' + band + '" stroke-width="2.5" d="M' + (hx - 2) + ' ' + (g - 8) + 'C' + (hx + 12) + ' ' + (g - 50) + ' ' + (hx + 80) + ' ' + (g - 50) + ' ' + (hx + 94) + ' ' + (g - 8) + '"/>';
    else if (style === 'garden') o += R(hx + 8, g - 22, 76, 22, K.wall) + R(hx + 36, g - 18, 20, 18, K.glass) + '<path fill="' + K.roof + '" d="M' + (hx - 10) + ' ' + (g - 22) + 'Q' + (hx + 46) + ' ' + (g - 32) + ' ' + (hx + 102) + ' ' + (g - 22) + 'L' + (hx + 84) + ' ' + (g - 38) + 'Q' + (hx + 46) + ' ' + (g - 46) + ' ' + (hx + 8) + ' ' + (g - 38) + 'z"/>' + R(hx + 8, g - 24, 76, 2.5, band) + '<circle cx="' + (hx - 4) + '" cy="' + (g - 20) + '" r="11" fill="#4f9d69"/>' + R(hx - 5, g - 10, 2.5, 10, K.trim);
    else if (style === 'industrial') { o += R(hx, g - 30, 92, 30, K.wall) + R(hx, g - 14, 92, 3, band); for (let k = 0; k < 3; k++) { const x = hx + k * 31; o += '<path fill="' + K.roof + '" d="M' + x + ' ' + (g - 30) + 'l30-12v12z"/>' + R(x + 6, g - 26, 18, 9, K.glass); } }
    else o += R(hx, g - 30, 92, 30, K.glass) + R(hx + 22, g - 30, 1.5, 30, '#ffffff99') + R(hx + 68, g - 30, 1.5, 30, '#ffffff99') + R(hx + 36, g - 20, 20, 20, '#ffffffb3') + R(hx - 5, g - 35, 102, 5, K.roof) + R(hx - 5, g - 38, 102, 3, band);
    // 导向柱与公共艺术
    const sign = SIGN_COL[dc.sign] || line, ax = hx + 120;
    o += R(hx + 103, g - 30, 3, 30, '#8c96a2') + R(hx + 99, g - 38, 11, 11, sign, 2);
    if (dc.art === 'sculpture') o += R(ax - 6, g - 4, 12, 4, '#c4c0b8') + '<path fill="' + band + '" d="M' + ax + ' ' + (g - 24) + 'l7 10-7 10-7-10z"/>';
    else if (dc.art === 'mural') o += R(ax - 11, g - 20, 22, 20, band, 1) + R(ax - 7, g - 15, 14, 3, '#ffffff99') + R(ax - 7, g - 9, 9, 3, '#ffffff99');
    else if (dc.art === 'light') for (const k of [-6, 0, 6]) o += R(ax + k - 1.5, g - (k ? 18 : 26), 3, k ? 18 : 26, band, 1.5);
    else if (dc.art === 'memory') o += R(ax - 13, g - 11, 26, 11, '#ac9070') + R(ax - 13, g - 13, 26, 2, band);
    // 高架的桥面与桥墩；地下的通道
    if (elev) { for (let x = 24; x < W; x += 72) o += '<rect class="st-pier" x="' + x + '" y="' + (plat + 9) + '" width="7" height="' + (g - plat - 9) + '"/>'; o += '<rect class="st-pier" x="0" y="' + (plat + 5) + '" width="' + W + '" height="5"/>'; }
    if (under) o += '<path class="st-stair" d="M' + (hx + 46) + ' ' + g + 'V' + (g + 22) + 'H' + (W / 2) + 'V' + (plat - 16) + '"/>';
    // 站台：虚线是扩建到大型站后的长度
    if (w < full) o += '<rect class="st-future" x="' + x0 + '" y="' + (plat - 16) + '" width="' + full + '" height="21" rx="3"/>';
    o += '<rect class="st-plat" x="' + x0 + '" y="' + plat + '" width="' + w + '" height="5" rx="1"/>';
    for (let k = 0; k < cars; k++) o += R(x0 + 10 + k * carW, plat - 14, carW - 2, 13, line, k === 0 || k === cars - 1 ? 4 : 1.5);
    return o + '</svg>';
  };
  CM.UI.prototype.stationArt = function (s, ls, over) { return stationArt(s, ls, over); };

  const mapCache = { key: null, url: null };
  CM.UI.prototype.openOpsApp = function (view, id) {
    const g = this.g(); if (!g) return;
    if (this.opsApp) { if (view) this.opsApp.go(view, id); else this.opsApp.close(); return; }
    const self = this, reduce = CM.Settings.reducedMotion(), F = CM.Fleet, I18 = function (el) { if (CM.I18n) CM.I18n.localize(el); return el; };
    const st = { root: 'home', view: 'home', id: null, hist: [], page: 0, f: { lines: 'all', stations: 'all' }, q: { lines: '', stations: '' }, tab: { line: 'info', station: 'info' }, metric: {}, sort: { lines: ['ord', 1], stations: ['flow', -1], stops: ['n', 1] } };
    let closing = false;
    const back = h('div', { class: 'mc-back', onclick: function () { close(); } });
    const app = h('div', { class: 'mc-app', role: 'dialog', 'aria-modal': 'true', 'aria-label': '地铁芯 · 线网管理系统', tabindex: '-1' });
    const bar = h('header', { class: 'mc-bar' }), content = h('main', { class: 'mc-content' }), draftBar = h('div', { class: 'mc-draft hidden' });
    const nets = function () { return g.draft ? g.draft.net : g.net; };
    // 关闭 App 后再执行（定位、回到地图操作），地图不被窗口挡住
    const then = function (fn) { return function () { close(fn); }; };
    const show = function (s, top) {
      st.view = s.view; st.id = s.id || null; st.root = ROOT_OF[s.view] || s.view;
      app.classList.remove('quiet');
      draw(); content.scrollTop = top || 0;
    };
    const setRoot = function (v) { st.hist = []; st.page = 0; show({ view: v }); };
    const open = function (s) { st.hist.push({ view: st.view, id: st.id, top: content.scrollTop }); if (st.hist.length > 20) st.hist.shift(); show(s); };
    const goBack = function () { const s = st.hist.pop(); if (s) show(s, s.top); else setRoot(st.root); };
    const openLine = function (lid) { open({ view: 'line', id: lid }); };
    const openStation = function (sid) { open({ view: 'station', id: sid }); };
    const go = function (v, target) {
      if (v === 'lines' || v === 'stations') { setRoot(v); if (target) (v === 'lines' ? openLine : openStation)(target); return; }
      setRoot(v === 'fleet' && g.fleet ? 'fleet' : 'home');
    };

    // ---------------- 导航 ----------------
    const nav = function (v, icon, label) { return h('button', { class: 'mc-nav', 'data-v': v, 'data-silent': '1', onclick: function () { if (st.root !== v || st.view !== v) sfx('tab'); setRoot(v); } }, ic(icon, 18), h('span', { class: 'lb' }, label), h('em', { style: { display: 'none' } })); };
    const navs = { home: nav('home', 'chart', '总览'), lines: nav('lines', 'route', '线路管理'), stations: nav('stations', 'metro', '车站管理') };
    if (g.fleet) navs.fleet = nav('fleet', 'train', '列车管理');
    const stateEl = h('div', { class: 'mc-state' });
    const count = function (b, n, alert) { const e = b.querySelector('em'); e.textContent = n ? String(n) : ''; e.className = alert ? 'alert' : ''; e.style.display = n ? '' : 'none'; };
    const drawRail = function () {
      for (const k in navs) navs[k].classList.toggle('on', st.root === k);
      const al = A.active(g).length;
      count(navs.home, al, true); count(navs.lines, Object.keys(g.net.lines).length); count(navs.stations, Object.keys(g.net.stations).length);
      if (navs.fleet) count(navs.fleet, g.fleet.trains.length);
      stateEl.className = 'mc-state' + (al ? ' warn' : '');
      stateEl.replaceChildren(h('i'), h('span', null, al ? al + ' 项待处理' : '线网运行平稳'));
      I18(stateEl);
    };
    const rail = h('nav', { class: 'mc-rail' },
      h('div', { class: 'mc-brand' }, h('span', { class: 'mc-logo' }, ic('chip', 20)), h('div', null, h('b', null, '地铁芯'), h('small', null, '线网管理系统'))),
      Object.values(navs),
      h('span', { class: 'grow' }), stateEl,
      h('button', { class: 'mc-exit', onclick: function () { close(); } }, ic('back', 16), h('span', { class: 'lb' }, '回到城市')));
    // 顶栏：当前位置（详情页带返回箭头）与城市、日期
    const setBar = function (crumbs) {
      const nodes = [];
      if (crumbs.length > 1) nodes.push(h('button', { class: 'iconbtn sm mc-backbtn', 'aria-label': '返回', onclick: goBack }, ic('arrowL', 16)));
      crumbs.forEach(function (c, i) {
        if (i) nodes.push(h('span', { class: 'mc-sep' }, '/'));
        nodes.push(c[1] ? h('button', { class: 'mc-crumb link', onclick: c[1] }, c[0]) : h('b', { class: 'mc-crumb' }, c[0]));
      });
      nodes.push(h('span', { class: 'grow' }), h('span', { class: 'mc-when' }, CM.DATA.city + ' · ' + g.clock.y + '年' + g.clock.m + '月'));
      bar.replaceChildren.apply(bar, nodes); I18(bar);
    };
    const setContent = function (nodes) { content.replaceChildren.apply(content, nodes.flat().filter(Boolean)); I18(content); };

    // ---------------- 数据 ----------------
    const lineRows = function () {
      const stats = CM.Tasks ? CM.Tasks.lineStats(g) : new Map(), crowd = new Map();
      if (CM.Tasks && g.model.trafficReady()) for (const x of CM.Tasks.crowdOf(g)) crowd.set(x.lid, x.lf);
      return M.sortIds(Object.keys(g.net.lines)).map(function (lid, i) {
        const L = g.net.lines[lid], tp = M.lineTopo(g.net, lid), s = stats.get(lid), info = F && g.fleet ? (F.lineInfo(g, lid) || []) : [];
        let km = 0; for (const sg of M.lineSegs(g.net, lid)) { const cs = g.compiled && g.compiled.segs.get(sg.id); km += (cs ? cs.g : M.segGeom(g.net, sg, g.city)).lenM / 1000; }
        return { ord: i, lid: lid, L: L, tp: tp, km: km, st: (tp.stations || []).length, kmh: M.lineKmh(L), riders: s ? s.riders : 0, lf: crowd.get(lid) || 0, avail: info.reduce(function (a, x) { return a + x.avail; }, 0), need: info.reduce(function (a, x) { return a + x.peakNeed; }, 0), svcs: (L.svcs || []).length };
      });
    };
    const stationRows = function () {
      const C = g.model.net ? g.model.net.C : g.compiled, sd = g.model.dailyStale ? null : g.model.stDailyWk || g.model.stDaily;
      return M.sortIds(Object.keys(g.net.stations)).map(function (sid) {
        const s = g.net.stations[sid], k = C.sIndex.get(sid), ok = k !== undefined && sd && k < sd.peak.length;
        return { sid: sid, s: s, lines: M.stationLines(g.net, sid), live: k !== undefined && !!C.serviced[k], flow: ok ? sd.inn[k] + sd.out[k] + sd.xfer[k] : 0, load: ok ? sd.peak[k] / CFG.metro.stationCap[s.size] : 0 };
      });
    };
    const ends = function (r, net) {
      const route = r.tp.routes[0], list = route ? route.st : (r.tp.stations || []), a = net.stations[list[0]], b = net.stations[list[list.length - 1]];
      if (!a) return '还没有车站';
      return r.tp.topo === 'loop' || !b || a === b ? a.name + ' · ' + M.TOPO_NAME.loop : a.name + ' — ' + b.name;
    };
    const lineColor = function (L) { const c = AX.line(L); return { background: c, color: AX.ink(c) }; };
    const lb = function (L) { return h('span', { class: 'mc-lb', style: lineColor(L) }, M.lineBadge(L)); };
    const matches = function (name, q) { return !q || name.toLowerCase().indexOf(q) >= 0 || (CM.I18n && CM.I18n.search(name).indexOf(q) >= 0); };
    const empty = function (icon, title, sub) { return h('div', { class: 'mc-empty' }, ic(icon, 26), h('b', null, title), sub ? h('span', null, sub) : null); };
    const cardHead = function (title, sub, right) { return h('div', { class: 'mc-card-h' }, h('b', null, title), sub ? h('small', null, sub) : null, h('span', { class: 'grow' }), right); };
    const kpi = function (label, value, sub, cls, onclick) { return h(onclick ? 'button' : 'div', { class: 'mc-kpi' + (cls ? ' ' + cls : ''), onclick: onclick }, h('small', null, label), h('b', null, value), sub ? h('span', null, sub) : null); };
    const locateBtn = function (kind, id, tip) { return h('button', { class: 'iconbtn sm', 'aria-label': '定位', 'data-tip': tip, onclick: function (e) { e.stopPropagation(); close(function () { A.locate(g, self, { kind: kind, id: id }); }); } }, ic('locate', 14)); };
    // 数据表：点表头排序（再点一次反向），点一行执行 onRow
    const table = function (name, cols, rows, onRow, refill, attr) {
      const sort = st.sort[name], col = cols.find(function (c) { return c.key === sort[0]; }) || { value: function (r) { return r[sort[0]]; } };
      const list = rows.slice().sort(function (a, b) { const x = col.value(a), y = col.value(b); return (typeof x === 'string' ? x.localeCompare(y) : x - y) * sort[1]; });
      const page = name === 'stations' ? list.slice(st.page * PAGE, (st.page + 1) * PAGE) : list;
      return h('table', { class: 'mc-table' },
        h('thead', null, h('tr', null, cols.map(function (c) {
          const on = sort[0] === c.key;
          return h('th', { class: (c.cls || '') + (c.value ? ' sortable' : '') + (on ? ' on' : ''), 'aria-sort': on ? (sort[1] > 0 ? 'ascending' : 'descending') : null, onclick: c.value ? function () { sfx('tap'); if (on) sort[1] = -sort[1]; else { sort[0] = c.key; sort[1] = c.desc ? -1 : 1; } st.page = 0; refill(); } : null }, c.label, on ? h('i', { class: 'mc-sort' }, sort[1] > 0 ? '▲' : '▼') : null);
        }))),
        h('tbody', null, page.map(function (r) { return h('tr', Object.assign({ onclick: function () { sfx('soft'); onRow(r); } }, attr ? attr(r) : null), cols.map(function (c) { return h('td', { class: c.cls || '' }, c.cell(r)); })); })));
    };
    // 表格上方：分类筛选与搜索
    const toolbar = function (name, defs, placeholder, fill) {
      const q = h('input', { type: 'search', class: 'mc-q', placeholder: placeholder, value: st.q[name], 'aria-label': placeholder, autocomplete: 'off' });
      q.addEventListener('input', function () { st.q[name] = q.value.trim(); st.page = 0; fill(); });
      return h('div', { class: 'mc-tools' },
        h('div', { class: 'seg-ctl sm', role: 'tablist' }, defs.map(function (c) { return h('button', { class: st.f[name] === c[0] ? 'on' : '', role: 'tab', 'aria-selected': st.f[name] === c[0] ? 'true' : 'false', 'data-silent': '1', onclick: function () { sfx('tab'); st.f[name] = c[0]; st.page = 0; draw(); content.scrollTop = 0; } }, c[1], h('small', { class: 'mc-n' }, String(c[2]))); })),
        h('span', { class: 'grow' }), h('label', { class: 'mc-search' }, ic('search', 14), q));
    };

    // ---------------- 地图预览 ----------------
    // 和主地图同一坐标的小地图（水面来自城市格网）。o.fit：要显示的范围；o.focus：突出的线路；o.station：突出的车站；o.all：所有线路都用线路色
    const baseImage = function () {
      const css = getComputedStyle(app), land = css.getPropertyValue('--mc-land').trim(), water = css.getPropertyValue('--mc-water').trim(), city = g.city, key = city.mapId + '|' + city.geoVer + '|' + land;
      if (mapCache.key === key) return mapCache.url;
      const c = document.createElement('canvas'); c.width = city.W; c.height = city.H;
      const x = c.getContext('2d'), im = x.createImageData(city.W, city.H), rgb = function (s) { return [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16)]; }, L = rgb(land), Wt = rgb(water);
      for (let i = 0; i < city.N; i++) { const f = U.clamp(city.landFrac[i], 0, 1); im.data[i * 4] = Wt[0] + (L[0] - Wt[0]) * f; im.data[i * 4 + 1] = Wt[1] + (L[1] - Wt[1]) * f; im.data[i * 4 + 2] = Wt[2] + (L[2] - Wt[2]) * f; im.data[i * 4 + 3] = 255; }
      x.putImageData(im, 0, 0);
      mapCache.key = key; mapCache.url = c.toDataURL();
      return mapCache.url;
    };
    const linePath = function (net, lid) { let d = ''; for (const sg of M.lineSegs(net, lid)) { const p = M.segGeom(net, sg, g.city).pts; for (let i = 0; i < p.length; i++) d += (i ? 'L' : 'M') + p[i][0].toFixed(1) + ' ' + p[i][1].toFixed(1); } return d; };
    const boundsOf = function (list) { let a = 1e9, b = 1e9, c = -1e9, d = -1e9; for (const s of list) { a = Math.min(a, s.x); b = Math.min(b, s.y); c = Math.max(c, s.x); d = Math.max(d, s.y); } return [a, b, c, d]; };
    const mapEl = function (o) {
      const net = nets(), asp = 1.6, minW = o.minW || 16, f = o.fit;
      let w = Math.max(minW, (f[2] - f[0]) * 1.2), ht = Math.max(minW / asp, (f[3] - f[1]) * 1.25); if (w / ht < asp) w = ht * asp; else ht = w / asp;
      const vx = (f[0] + f[2]) / 2 - w / 2, vy = (f[1] + f[3]) / 2 - ht / 2, px = w / 400;   // px：1 个屏幕像素约等于多少地图单位
      const dotAt = function (s, r, cls, extra) { return '<circle class="' + cls + '" cx="' + s.x.toFixed(1) + '" cy="' + s.y.toFixed(1) + '" r="' + (r * px).toFixed(2) + '"' + (extra || '') + '/>'; };
      const label = function (s, text, dx, dy) { const flip = s.x > vx + w * 0.62; return '<text class="mc-mapt"' + (flip ? ' text-anchor="end"' : '') + ' x="' + (s.x + (flip ? -dx : dx) * px).toFixed(1) + '" y="' + (s.y + dy * px).toFixed(1) + '" font-size="' + (11 * px).toFixed(2) + '" stroke-width="' + (3 * px).toFixed(2) + '">' + esc(text) + '</text>'; };
      let o2 = '<svg viewBox="' + vx.toFixed(1) + ' ' + vy.toFixed(1) + ' ' + w.toFixed(1) + ' ' + ht.toFixed(1) + '" preserveAspectRatio="xMidYMid slice"><image href="' + baseImage() + '" x="0" y="0" width="' + g.city.W + '" height="' + g.city.H + '" preserveAspectRatio="none"/>';
      const through = o.station ? M.stationLines(net, o.station) : [];
      let top = '';
      for (const lid of M.sortIds(Object.keys(net.lines))) {
        const L = net.lines[lid], d = linePath(net, lid); if (!d) continue;
        const col = AX.line(L), hot = o.all || lid === o.focus || through.indexOf(lid) >= 0;
        if (hot) top += '<path class="mc-halo" d="' + d + '"/><path class="mc-l" stroke="' + col + '" d="' + d + '"/>';
        else o2 += '<path class="mc-other" d="' + d + '"/>';
        if (o.all) top += '<path class="mc-hit" data-lid="' + esc(lid) + '" data-tip="' + esc(L.name) + '" d="' + d + '"/>';
      }
      o2 += top;
      if (o.station) {
        const s = net.stations[o.station], rw = (CFG.walk.maxAccessM / CFG.CELL_M).toFixed(2);
        o2 += '<circle class="mc-walk" cx="' + s.x.toFixed(1) + '" cy="' + s.y.toFixed(1) + '" r="' + rw + '"/>';
        for (const id in net.stations) { const q = net.stations[id]; if (id !== o.station && Math.abs(q.x - s.x) < w / 2 && Math.abs(q.y - s.y) < ht / 2) o2 += dotAt(q, 2.5, 'mc-st2'); }
        o2 += dotAt(s, 6, 'mc-st1') + label(s, s.name, 9, 4);
      } else if (o.focus) {
        const tp = M.lineTopo(net, o.focus), ids = tp.stations || [], ends = tp.routes.length ? tp.routes.map(function (r) { return [r.st[0], r.st[r.st.length - 1]]; }).flat() : [];
        for (const id of ids) if (net.stations[id]) o2 += dotAt(net.stations[id], 3, 'mc-st2');
        for (const id of ends.filter(function (v, i, a) { return a.indexOf(v) === i; })) if (net.stations[id]) o2 += dotAt(net.stations[id], 4.5, 'mc-st1') + label(net.stations[id], net.stations[id].name, 7, -6);
      } else if (o.alerts) {
        for (const r of o.alerts) o2 += dotAt(r.s, 5, 'mc-st3');
      }
      if (o.tods) for (const r of o.tods) o2 += dotAt(r.s, 3 + r.s.tod, 'mc-st4');
      const box = h('div', { class: 'mc-map' + (o.onClick || o.all ? ' act' : ''), html: o2 + '</svg>', 'data-tip': o.tip || null });
      box.addEventListener('click', function (e) { const t = e.target.closest && e.target.closest('[data-lid]'); if (t) { sfx('soft'); openLine(t.getAttribute('data-lid')); } else if (o.onClick) o.onClick(); });
      return box;
    };
    // 指标切换的趋势卡片
    const metricCard = function (key, metrics) {
      const box = h('section', { class: 'mc-card' });
      const paint = function () {
        const m = metrics.find(function (x) { return x.k === st.metric[key]; }) || metrics[0];
        box.replaceChildren(cardHead(m.label, m.sub, metrics.length > 1 ? h('div', { class: 'seg-ctl sm' }, metrics.map(function (x) { return h('button', { class: x === m ? 'on' : '', 'data-silent': '1', onclick: function () { if (x !== m) sfx('tab'); st.metric[key] = x.k; paint(); } }, x.short || x.label); })) : null), h('div', { class: 'mc-pad' }, trendChart(m.pts, m)));
        I18(box);
      };
      paint();
      return box;
    };
    const lineMetricCard = function (lid) {
      const rows = A.rows(g, 'l', lid), marks = A.logOf(g, 'l', lid).map(function (e) { return e.ym; }), series = function (i) { return rows.map(function (r) { return [r[0], r[i]]; }); };
      return metricCard('line', [
        { k: 'r', label: '日客运量', sub: '竖虚线为改造', pts: series(1), fmt: U.fmtPeople, marks: marks },
        { k: 'lf', label: '高峰满载', sub: '早高峰最拥挤区段', pts: series(2), fmt: percent, ref: 100, refLabel: '虚线 = 满载 100%', marks: marks },
        { k: 'hw', label: '高峰间隔', sub: '早高峰发车间隔', pts: series(3), fmt: tenth, marks: marks },
      ]);
    };
    const stationMetricCard = function (sid) {
      const rows = A.rows(g, 's', sid), marks = A.logOf(g, 's', sid).map(function (e) { return e.ym; }), series = function (i) { return rows.map(function (r) { return [r[0], r[i]]; }); };
      return metricCard('station', [
        { k: 'f', label: '日客流', sub: '进站、出站与换乘，竖虚线为改造', pts: series(1), fmt: U.fmtPeople, marks: marks },
        { k: 'l', label: '高峰负荷', sub: '高峰客流 / 车站能力', pts: series(2), fmt: percent, ref: 100, refLabel: '虚线 = 能力 100%', marks: marks },
      ]);
    };
    // 改造效果：本月的改动（下月出结果）与之前改造前后的指标对比
    const changeEl = function (c) { return h('span', { class: 'mc-ch' }, A.changeText(c)); };
    const fxMetric = function (m, a, b) {
      if (a == null || b == null || a === b || (a > 0 && Math.abs(b - a) / a < 0.01)) return null;
      const rise = b > a;
      return h('div', { class: 'mc-fx-m' }, h('small', null, m.label), h('span', null, m.fmt(a), ' → ', h('b', null, m.fmt(b))), h('em', { class: 'mc-delta ' + (rise === !!m.up ? 'good' : 'bad') }, (rise ? '▲' : '▼') + (a > 0 ? ' ' + U.fmtPct(Math.abs(b - a) / a, 0) : '')));
    };
    const fxBody = function (kind, e, now) {
      const ms = now ? METRICS[kind].map(function (m) { return fxMetric(m, e.b[m.i], now[m.i]); }).filter(Boolean) : [];
      return h('div', { class: 'mc-fx-b' }, h('div', { class: 'mc-fx-ch' }, e.ch.map(changeEl)), ms.length ? h('div', { class: 'mc-fx-ms' }, ms) : h('small', null, '指标还没有明显变化'));
    };
    const fxCard = function (kind, id) {
      const pend = A.pending(g, kind, id), logs = A.logOf(g, kind, id).slice(-3).reverse(), rows = A.rows(g, kind, id), now = rows[rows.length - 1];
      if (!pend.length && !logs.length) return null;
      let extra = null;
      if (kind === 'l' && now) { const t = tripOf(g.compiled.routes.find(function (r) { return r.lineId === id && !r.svc; })); if (t && now[4] && Math.abs(t - now[4]) / now[4] >= 0.01) extra = h('span', { class: 'mc-ch' }, '单程用时 ' + tenth(now[4]) + ' → ' + tenth(t)); }
      return h('section', { class: 'mc-card' }, cardHead('改造效果', '改造前一个月与当前对比；城市增长和其他改造也会影响结果'),
        pend.length ? h('div', { class: 'mc-fx' }, h('span', { class: 'mc-fx-d' }, '本月'), h('div', { class: 'mc-fx-b' }, h('div', { class: 'mc-fx-ch' }, pend.map(changeEl), extra), h('small', null, '客流变化下个月初显示'))) : null,
        logs.map(function (e) { return h('div', { class: 'mc-fx' }, h('span', { class: 'mc-fx-d' }, ymText(e.ym)), fxBody(kind, e, now)); }));
    };
    const recentFx = function () {
      const log = (g.opsNote && g.opsNote.log || []).slice(-4).reverse().filter(function (e) { return (e.k === 'l' ? g.net.lines : g.net.stations)[e.id]; });
      if (!log.length) return null;
      return h('section', { class: 'mc-card' }, cardHead('最近的改造效果', '改造前一个月与当前对比'), log.map(function (e) {
        const L = e.k === 'l' ? g.net.lines[e.id] : null, s = e.k === 's' ? g.net.stations[e.id] : null, rows = A.rows(g, e.k, e.id);
        return h('button', { class: 'mc-fx link', onclick: function () { (L ? openLine : openStation)(e.id); } }, h('span', { class: 'mc-fx-d' }, ymText(e.ym)), h('span', { class: 'mc-fx-o' }, L ? lb(L) : ic('metro', 14), h('b', null, L ? L.name : s.name)), fxBody(e.k, e, rows[rows.length - 1]));
      }));
    };
    // 客流构成：一条堆叠条 + 图例（数值直接标出）
    const flowMix = function (inn, out, xfer) {
      const tot = Math.max(1, inn + out + xfer), parts = [['进站', inn, 'a'], ['出站', out, 'b'], ['换乘', xfer, 'c']];
      return h('section', { class: 'mc-card' }, cardHead('客流构成', '日均'), h('div', { class: 'mc-pad' },
        h('div', { class: 'mc-stack' }, parts.map(function (p) { return p[1] > 0 ? h('i', { class: p[2], style: { flexGrow: String(p[1] / tot) }, 'data-tip': p[0] + ' ' + U.fmtInt(p[1]) }) : null; })),
        h('div', { class: 'mc-legend' }, parts.map(function (p) { return h('span', null, h('i', { class: p[2] }), p[0], h('b', null, U.fmtPeople(p[1])), h('small', null, U.fmtPct(p[1] / tot, 0))); }))));
    };

    // ---------------- 总览 ----------------
    const todoRow = function (x) {
      const L = x.kind === 'line' ? g.net.lines[x.id] : null, s = x.kind === 'station' ? g.net.stations[x.id] : null; if (!L && !s) return null;
      const plan = A.plan(g, x), detail = function () { (L ? openLine : openStation)(x.id); };
      return h('div', { class: 'mc-todo' },
        tag([x.level === 'bad' ? 'bad' : 'warn', x.level === 'bad' ? '严重' : '过载']),
        h('button', { class: 'mc-todo-t', 'data-tip': '查看详情', onclick: detail },
          h('span', { class: 'mc-todo-n' }, L ? lb(L) : ic('metro', 14), h('b', null, x.name), h('span', null, x.what)),
          h('small', null, x.sub), h('small', { class: 'mc-plan' }, plan.ok ? '建议：' + plan.text : plan.text)),
        actions(self, g, x, function (how) { if (how === 'locate') close(); else draw(); }),
        h('button', { class: 'iconbtn sm', 'aria-label': '暂不提醒', 'data-tip': '一年内不再提醒这一项', onclick: function () { A.snooze(g, self, x); draw(); } }, ic('close', 13)));
    };
    const rankCard = function (title, sub, items, more) {
      return h('section', { class: 'mc-card' }, cardHead(title, sub, h('button', { class: 'mc-link', onclick: more }, '查看全部', ic('chev', 13))),
        h('div', { class: 'mc-rank' }, items.length ? items.map(function (it, i) { return h('button', { class: 'mc-rank-r', onclick: it.go }, h('small', null, String(i + 1)), it.badge, h('span', { class: 'mc-rank-n' }, it.name), loadBar(it.v)); }) : h('div', { class: 'mc-none' }, '暂无客流数据')));
    };
    const overview = function () {
      setBar([['总览']]);
      const d = g.model.daily || {}, rows = lineRows(), srows = stationRows(), al = A.active(g), fl = g.fleet ? g.fleet.trains : [], km = rows.reduce(function (a, r) { return a + r.km; }, 0);
      const need = rows.reduce(function (a, r) { return a + r.need; }, 0), avail = rows.reduce(function (a, r) { return a + r.avail; }, 0), on = CM.Settings.get('opsPop') !== false;
      const hist = g.history, hl = hist[hist.length - 1], hp = hist.length > 1 ? hist[hist.length - 2] : null;
      const kpis = h('div', { class: 'mc-kpis' },
        kpi('日客运量', d.metro ? U.fmtPeople(d.metro) : '—', hp ? deltaEl(hl.riders, hp.riders, true) : '人次（周平均）'),
        kpi('地铁分担率', d.metroShare != null ? U.fmtPct(d.metroShare, 1) : '—', hp ? deltaEl(hl.share, hp.share, true) : '全部出行'),
        kpi('满意度', String(Math.round(g.econ.sat)), hp ? deltaEl(hl.sat, hp.sat, true) : '满分 100'),
        kpi('线路', String(rows.length), U.fmtNum(km, 1) + ' km', '', function () { setRoot('lines'); }),
        kpi('车站', String(srows.length), srows.filter(function (r) { return r.lines.length > 1; }).length + ' 座换乘', '', function () { setRoot('stations'); }),
        g.fleet ? kpi('列车', String(fl.length), '配属 ' + avail + ' / 需要 ' + need, need > avail ? 'warn' : '', function () { setRoot('fleet'); }) : null);
      const sw = h('button', { class: 'switch' + (on ? ' on' : ''), role: 'switch', 'aria-checked': on ? 'true' : 'false', 'aria-label': '自动弹出提醒', 'data-silent': '1', 'data-tip': '在入口上方出现小卡片，最多每 3 个月一次；关闭后只显示角标', onclick: function () { sfx('toggle'); CM.Settings.set('opsPop', !on); draw(); } }, h('i'));
      const todo = h('section', { class: 'mc-card' }, cardHead('待处理事项', al.length ? al.length + ' 项' : '', h('label', { class: 'mc-swl' }, h('span', null, '自动弹出提醒'), sw)),
        al.length ? al.map(todoRow) : (rows.length ? empty('check', '线网运行平稳', '线路或车站连续两个月负荷超过 110% 时列在这里。') : empty('route', '还没有线路', '回到地图用「绘线」修第一条线，修好后在这里管理。')));
      const topL = rows.filter(function (r) { return r.lf > 0; }).sort(function (a, b) { return b.lf - a.lf; }).slice(0, 6).map(function (r) { return { name: r.L.name, v: r.lf, badge: lb(r.L), go: function () { openLine(r.lid); } }; });
      const topS = srows.filter(function (r) { return r.load > 0; }).sort(function (a, b) { return b.load - a.load; }).slice(0, 6).map(function (r) { return { name: r.s.name, v: r.load, go: function () { openStation(r.sid); } }; });
      const allSt = Object.values(g.net.stations), over = srows.filter(function (r) { return r.load > 1; });
      const dev = srows.filter(function (r) { return r.s.tod; });
      const netCard = h('section', { class: 'mc-card' }, cardHead('线网预览', rows.length + ' 条线路', h('span', { class: 'mc-maplg' }, over.length ? [h('i'), '过载 ' + over.length] : null, dev.length ? [h('i', { class: 'tod' }), '已开发 ' + dev.length] : null)),
        allSt.length ? mapEl({ fit: boundsOf(allSt), all: true, alerts: over, tods: dev, minW: 40 }) : h('div', { class: 'mc-none' }, '修好线路后在这里预览线网'));
      const hseries = function (key, f) { return hist.slice(-120).map(function (r) { return [U.ymIndex(r.y, r.m), f ? f(r[key]) : r[key]]; }); };
      const trendCard = metricCard('net', [
        { k: 'riders', label: '日客运量', sub: '周平均', short: '客运量', pts: hseries('riders'), fmt: U.fmtPeople },
        { k: 'share', label: '地铁分担率', sub: '地铁占全部出行', short: '分担率', pts: hseries('share', function (v) { return Math.round(v * 1000) / 10; }), fmt: function (v) { return U.fmtNum(v, 1) + '%'; } },
        { k: 'sat', label: '满意度', sub: '满分 100', pts: hseries('sat', function (v) { return Math.round(v); }), fmt: function (v) { return String(Math.round(v)); } },
      ]);
      setContent([kpis, h('div', { class: 'mc-cols' }, netCard, trendCard), todo, recentFx(), h('div', { class: 'mc-cols' }, rankCard('线路满载率', '早高峰最拥挤区段', topL, function () { setRoot('lines'); }), rankCard('车站负荷', '高峰客流 / 能力', topS, function () { setRoot('stations'); }))]);
    };

    // ---------------- 线路管理 ----------------
    const lineCols = [
      { key: 'ord', label: '线路', value: function (r) { return r.ord; }, cell: function (r) { return h('span', { class: 'mc-obj' }, lb(r.L), h('b', null, r.L.name)); } },
      { key: 'ends', label: '走向', cls: 'mc-dim opt', cell: function (r) { return h('span', { class: 'mc-trunc' }, ends(r, g.net)); } },
      { key: 'km', label: '长度', cls: 'num', desc: true, value: function (r) { return r.km; }, cell: function (r) { return U.fmtNum(r.km, 1) + ' km'; } },
      { key: 'st', label: '车站', cls: 'num opt', desc: true, value: function (r) { return r.st; }, cell: function (r) { return String(r.st); } },
      { key: 'kmh', label: '速度', cls: 'num opt', desc: true, value: function (r) { return r.kmh; }, cell: function (r) { return r.kmh + ' km/h'; } },
      { key: 'riders', label: '日客运量', cls: 'num', desc: true, value: function (r) { return r.riders; }, cell: function (r) { return r.riders ? U.fmtPeople(r.riders) : '—'; } },
      { key: 'spark', label: '趋势', cls: 'opt', cell: function (r) { return sparkLine(A.rows(g, 'l', r.lid), 1); } },
      { key: 'train', label: '配属 / 需要', cls: 'num', desc: true, value: function (r) { return r.need - r.avail; }, cell: function (r) { return h('span', { class: r.need > r.avail ? 'mc-warn' : '' }, r.avail + ' / ' + r.need); } },
      { key: 'lf', label: '高峰满载', desc: true, value: function (r) { return r.lf; }, cell: function (r) { return loadBar(r.lf); } },
      { key: 'state', label: '状态', cell: function (r) { return tag(lineState(r)); } },
      { key: 'go', label: '', cls: 'mc-act', cell: function (r) { return locateBtn('line', r.lid, '在地图上定位这条线路'); } },
    ];
    const linesView = function () {
      setBar([['线路管理']]);
      const rows = lineRows(), over = rows.filter(function (r) { return r.lf > 1; }), short = rows.filter(function (r) { return r.need > r.avail; }), host = h('section', { class: 'mc-card' });
      const base = st.f.lines === 'over' ? over : (st.f.lines === 'short' ? short : rows);
      const fill = function () {
        const q = st.q.lines.toLowerCase(), list = base.filter(function (r) { return matches(r.L.name, q); });
        host.replaceChildren(list.length ? table('lines', lineCols, list, function (r) { openLine(r.lid); }, fill, function (r) { return { 'data-lid': r.lid }; }) : (rows.length ? empty('search', '没有符合条件的线路') : empty('route', '还没有线路', '回到地图用「绘线」修第一条线，修好后在这里管理。')));
        I18(host);
      };
      fill();
      setContent([toolbar('lines', [['all', '全部', rows.length], ['over', '过载', over.length], ['short', '缺车', short.length]], '搜索线路', fill), host]);
    };
    const tabBar = function (kind, defs, official, always) {
      if (!official) st.tab[kind] = always;
      return h('div', { class: 'mc-tabs', role: 'tablist' }, defs.map(function (t) {
        return h('button', { class: st.tab[kind] === t[0] ? 'on' : '', role: 'tab', 'aria-selected': st.tab[kind] === t[0] ? 'true' : 'false', 'data-t': t[0], disabled: official || t[0] === always ? null : true, 'data-silent': '1', onclick: function () { if (st.tab[kind] !== t[0]) sfx('tab'); st.tab[kind] = t[0]; draw(); } }, t[1]);
      }));
    };
    const nameInput = function (value, max, label, commit) {
      const el = h('input', { type: 'text', class: 'mc-name', value: value, maxlength: max, 'aria-label': label, 'data-tip': '点击改名，立即生效' });
      el.addEventListener('change', function () { commit(el); });
      el.addEventListener('keydown', function (e) { if (e.isComposing || e.keyCode === 229) return; if (e.key === 'Enter') { e.preventDefault(); el.blur(); } });
      return el;
    };
    const stopCols = [
      { key: 'n', label: '序号', cls: 'num', value: function (r) { return r.n; }, cell: function (r) { return String(r.n); } },
      { key: 'name', label: '车站', value: function (r) { return r.s.name; }, cell: function (r) { return h('b', null, r.s.name); } },
      { key: 'size', label: '规模', value: function (r) { return SIZE_ORDER[r.s.size]; }, cell: function (r) { return CFG.metro.sizeName[r.s.size]; } },
      { key: 'xfer', label: '线路', desc: true, value: function (r) { return r.lines.length; }, cell: function (r) { return h('span', { class: 'mc-lbs' }, r.lines.map(function (l) { return g.net.lines[l] ? lb(g.net.lines[l]) : null; })); } },
      { key: 'flow', label: '日客流', cls: 'num', desc: true, value: function (r) { return r.flow; }, cell: function (r) { return r.flow ? U.fmtPeople(r.flow) : '—'; } },
      { key: 'load', label: '高峰负荷', desc: true, value: function (r) { return r.load; }, cell: function (r) { return loadBar(r.load); } },
    ];
    const stopTables = function (row, net) {
      const by = new Map(stationRows().map(function (r) { return [r.sid, r]; })), groups = [], seen = new Set();
      for (const route of (row.tp.routes.length ? row.tp.routes : [{ st: row.tp.stations || [] }])) { const a = route.st.filter(function (sid, i) { return groups.length ? !seen.has(sid) : route.st.indexOf(sid) === i; }); a.forEach(function (sid) { seen.add(sid); }); if (a.length) groups.push(a); }
      return groups.map(function (a, i) {
        const rows = a.map(function (sid, n) { const s = net.stations[sid]; return s ? Object.assign({ sid: sid, s: s, lines: M.stationLines(net, sid), flow: 0, load: 0, live: false }, by.get(sid), { n: n + 1 }) : null; }).filter(Boolean);
        return h('section', { class: 'mc-card' }, groups.length > 1 ? cardHead(i ? '支线' : '主线', rows.length + ' 站') : null, table('stops', stopCols, rows, function (r) { if (g.net.stations[r.sid]) openStation(r.sid); }, draw));
      });
    };
    const lineDetail = function () {
      const net = nets(), lid = st.id, L = net.lines[lid], rootCrumb = ['线路管理', function () { setRoot('lines'); }];
      if (!L) { setBar([rootCrumb, ['线路已不存在']]); setContent([empty('route', '线路已不存在')]); return; }
      setBar([rootCrumb, [L.name]]);
      const official = !!g.net.lines[lid], tp = M.lineTopo(net, lid), row = lineRows().find(function (r) { return r.lid === lid; }) || { lid: lid, L: L, tp: tp, km: 0, st: (tp.stations || []).length, kmh: M.lineKmh(L), riders: 0, lf: 0, avail: 0, need: 0, svcs: 0 };
      const headCard = h('section', { class: 'mc-card mc-dh' },
        h('button', { class: 'mc-swatch', style: lineColor(L), 'aria-label': '修改线路颜色', 'data-tip': '修改线路颜色', onclick: function (e) { if (CM.Quick) CM.Quick.popColor(lid, e.currentTarget); } }, M.lineBadge(L)),
        h('div', { class: 'mc-dh-t' },
          nameInput(L.name, 14, '线路名称', function (el) { const v = el.value.trim(); if (v && v !== L.name) self.setLineLook(lid, { name: v }); else el.value = L.name; }),
          h('div', { class: 'mc-meta' }, official ? tag(lineState(row)) : tag(['', '草案']), h('span', null, M.TOPO_NAME[tp.topo]), h('span', null, ends(row, net)))),
        official ? h('button', { class: 'btn sm', 'data-tip': '在地图上定位这条线路', onclick: then(function () { A.locate(g, self, { kind: 'line', id: lid }); }) }, ic('locate', 14), '定位') : null,
        h('button', { class: 'btn sm', 'data-tip': '贯通、拆开、支线与区段调整', onclick: then(function () { self.openObj('line', lid, 'build'); }) }, ic('pencil', 14), '线路编辑'));
      const lrows = A.rows(g, 'l', lid), prevRow = lrows.length > 1 ? lrows[lrows.length - 2] : null;
      const kpis = h('div', { class: 'mc-kpis' },
        kpi('长度', U.fmtNum(row.km, 1) + ' km'), kpi('车站', row.st + ' 座'), kpi('运行速度', row.kmh + ' km/h'),
        kpi('日客运量', row.riders ? U.fmtPeople(row.riders) : '—', prevRow ? deltaEl(row.riders, prevRow[1], true) : null), kpi('高峰满载', pctText(row.lf), prevRow ? deltaEl(row.lf * 100, prevRow[2], false) : null, loadCls(row.lf)), kpi('列车', row.avail + ' / ' + row.need, '配属 / 高峰需要', row.need > row.avail ? 'warn' : ''));
      const lineSt = (tp.stations || []).map(function (id) { return net.stations[id]; }).filter(Boolean);
      const preview = h('div', { class: 'mc-cols' },
        h('section', { class: 'mc-card' }, cardHead('线路预览', official ? '点击在地图上定位' : '草案'), lineSt.length ? mapEl({ fit: boundsOf(lineSt), focus: lid, onClick: official ? then(function () { A.locate(g, self, { kind: 'line', id: lid }); }) : null }) : h('div', { class: 'mc-none' }, '这条线路还没有车站')),
        lineMetricCard(lid));
      const bar2 = tabBar('line', [['info', '断面客流'], ['ops', '列车运营'], ['st', '车站列表']], official, 'st'), nodes = [headCard, kpis, preview, official ? fxCard('l', lid) : null, bar2], tab = st.tab.line;
      if (tab === 'ops') { const body = h('section', { class: 'mc-card mc-pad' }); if (g.fleet && F) self.lineOpsTab(body, lid); nodes.push(body); }
      else if (tab === 'st') nodes.push(stopTables(row, net));
      else {
        const mnet = g.model.net, W = g.model.weights(g.clock.minute);
        const routes = mnet ? mnet.C.routes.map(function (r, i) { return [r, i]; }).filter(function (a) { return a[0].lineId === lid; }) : [];
        for (const it of routes) {
          const f = g.model.freqAt(it[1], W);
          nodes.push(h('section', { class: 'mc-card' }, cardHead(it[0].label, f > 0.05 ? '间隔 ' + U.fmtNum(60 / f, 1) + ' 分钟 · 周转 ' + Math.round(it[0].cycleSec / 60) + ' 分钟' : '当前无列车运行'), h('div', { class: 'mc-pad' }, self.loadChart(it[0], it[1], W))));
        }
        if (!routes.length) nodes.push(h('section', { class: 'mc-card' }, empty('train', '还没有运营数据', '线路开通后在这里看各区段的客流。')));
      }
      setContent(nodes);
    };

    // ---------------- 车站管理 ----------------
    const stationCols = [
      { key: 'name', label: '车站', value: function (r) { return r.s.name; }, cell: function (r) { return h('b', { class: 'mc-trunc' }, r.s.name); } },
      { key: 'size', label: '规模', desc: true, value: function (r) { return SIZE_ORDER[r.s.size]; }, cell: function (r) { return CFG.metro.sizeName[r.s.size]; } },
      { key: 'xfer', label: '线路', desc: true, value: function (r) { return r.lines.length; }, cell: function (r) { return h('span', { class: 'mc-lbs' }, r.lines.slice(0, 6).map(function (l) { return g.net.lines[l] ? lb(g.net.lines[l]) : null; })); } },
      { key: 'flow', label: '日客流', cls: 'num', desc: true, value: function (r) { return r.flow; }, cell: function (r) { return r.flow ? U.fmtPeople(r.flow) : '—'; } },
      { key: 'load', label: '高峰负荷', desc: true, value: function (r) { return r.load; }, cell: function (r) { return loadBar(r.load); } },
      { key: 'tod', label: '商业开发', cls: 'opt', desc: true, value: function (r) { return r.s.tod || 0; }, cell: function (r) { return r.s.tod ? '第 ' + r.s.tod + ' 级' : '—'; } },
      { key: 'state', label: '状态', cell: function (r) { return tag(stationState(r)); } },
      { key: 'go', label: '', cls: 'mc-act', cell: function (r) { return locateBtn('station', r.sid, '在地图上定位这座车站'); } },
    ];
    const stationsView = function () {
      setBar([['车站管理']]);
      const rows = stationRows(), over = rows.filter(function (r) { return r.load > 1; }), xfer = rows.filter(function (r) { return r.lines.length > 1; }), dev = rows.filter(function (r) { return r.s.tod; }), host = h('section', { class: 'mc-card' }), pager = h('div', { class: 'mc-pager' });
      const base = { all: rows, over: over, xfer: xfer, dev: dev }[st.f.stations];
      const fill = function () {
        const q = st.q.stations.toLowerCase(), list = base.filter(function (r) { return matches(r.s.name, q); }), pages = Math.max(1, Math.ceil(list.length / PAGE));
        st.page = Math.min(st.page, pages - 1);
        host.replaceChildren(list.length ? table('stations', stationCols, list, function (r) { openStation(r.sid); }, fill, function (r) { return { 'data-sid': r.sid }; }) : (rows.length ? empty('search', '没有符合条件的车站') : empty('metro', '还没有车站', '回到地图用「建站」或「绘线」放下第一座车站。')));
        pager.replaceChildren.apply(pager, pages > 1 ? [h('span', null, '共 ' + list.length + ' 座'), h('span', { class: 'grow' }), h('button', { class: 'btn sm', disabled: st.page > 0 ? null : true, onclick: function () { st.page--; fill(); content.scrollTop = 0; } }, '上一页'), h('span', { class: 'mc-pageno' }, (st.page + 1) + ' / ' + pages), h('button', { class: 'btn sm', disabled: st.page < pages - 1 ? null : true, onclick: function () { st.page++; fill(); content.scrollTop = 0; } }, '下一页')] : []);
        I18(host); I18(pager);
      };
      fill();
      const devMap = st.f.stations === 'dev' && dev.length ? h('section', { class: 'mc-card' }, cardHead('已开发车站分布', '圆点越大，开发等级越高'), mapEl({ fit: boundsOf(Object.values(g.net.stations)), tods: dev, minW: 40 })) : null;
      setContent([toolbar('stations', [['all', '全部', rows.length], ['over', '过载', over.length], ['xfer', '换乘站', xfer.length], ['dev', '已开发', dev.length]], '搜索车站', fill), devMap, host, pager]);
    };
    const stationDetail = function () {
      const net = nets(), sid = st.id, s = net.stations[sid], rootCrumb = ['车站管理', function () { setRoot('stations'); }];
      if (!s) { setBar([rootCrumb, ['车站已不存在']]); setContent([empty('metro', '车站已不存在')]); return; }
      setBar([rootCrumb, [s.name]]);
      const official = !!g.net.stations[sid], ls = M.stationLines(net, sid).map(function (l) { return net.lines[l]; }).filter(Boolean);
      const C = g.model.net ? g.model.net.C : null, k = C ? C.sIndex.get(sid) : undefined, sd = g.model.stDaily, sw = g.model.stDailyWk, serviced = k !== undefined && !!C.serviced[k], live = serviced && sd && !g.model.dailyStale && k < sd.inn.length;
      const cap = CFG.metro.stationCap[s.size], peak = live && sw ? sw.peak[k] : 0, load = peak / cap, kind = s.lv ? M.levelsText(M.stationLevels(net, sid)) : CFG.metro.typeName[s.type], I = official ? self.todInfo(sid) : null;
      const headCard = h('section', { class: 'mc-card mc-dh' },
        h('span', { class: 'mc-swatch mc-st' }, ic('metro', 22)),
        h('div', { class: 'mc-dh-t' },
          nameInput(s.name, 16, '车站名称', function (el) { const r = self.setStationName(sid, el.value); if (r && r.error) { self.toast(r.error, 'bad'); el.value = s.name; } }),
          h('div', { class: 'mc-meta' }, official ? tag(stationState({ live: serviced, load: load })) : tag(['', '草案']), h('span', null, CFG.metro.sizeName[s.size] + '车站'), h('span', null, kind),
            ls.map(function (L) { return h('button', { class: 'mc-chip', 'data-tip': '打开线路', onclick: function () { openLine(L.id); } }, lb(L), L.name); }))),
        official ? h('button', { class: 'btn sm', 'data-tip': '在地图上定位这座车站', onclick: then(function () { A.locate(g, self, { kind: 'station', id: sid }); }) }, ic('locate', 14), '定位') : null);
      const kpis = live ? h('div', { class: 'mc-kpis' },
        kpi('日进站', U.fmtPeople(sd.inn[k])), kpi('日出站', U.fmtPeople(sd.out[k])), kpi('日换乘', U.fmtPeople(sd.xfer[k])),
        kpi('高峰负荷', U.fmtPct(load, 0), U.fmtInt(peak) + ' / ' + U.fmtInt(cap) + ' 人次/时', loadCls(load)),
        kpi('站台规模', CFG.metro.sizeName[s.size], '最长 ' + CFG.metro.carsBySize[s.size] + ' 节'),
        I ? kpi('商业开发', I.lv ? '第 ' + I.lv + ' 级' : '未开发', I.lv ? '每月净 ' + U.fmtMoney(I.net(I.lv)) : '') : null) : null;
      const bar2 = tabBar('station', [['info', '拥挤诊断'], ['build', '规模与站台'], ['tod', '商业开发'], ['decor', '车站装修']], official, 'build'), tab = st.tab.station, refresh = function () { draw(); };
      const artCap = CFG.metro.sizeName[s.size] + '车站 · ' + kind + ' · 最长 ' + CFG.metro.carsBySize[s.size] + ' 节' + (s.tod ? ' · 商业第 ' + s.tod + ' 级' : '');
      const preview = h('div', { class: 'mc-cols' },
        h('section', { class: 'mc-card' }, cardHead('位置预览', '圆圈为步行可达范围'), mapEl({ fit: [s.x - 10, s.y - 7, s.x + 10, s.y + 7], minW: 24, station: sid, onClick: official ? then(function () { A.locate(g, self, { kind: 'station', id: sid }); }) : null })),
        h('section', { class: 'mc-card' }, cardHead('车站示意', artCap), h('div', { class: 'st-artbox', html: stationArt(s, ls) })));
      const charts = live ? h('div', { class: 'mc-cols' }, flowMix(sd.inn[k], sd.out[k], sd.xfer[k]), stationMetricCard(sid)) : null;
      const nodes = [headCard, kpis, preview, charts, official ? fxCard('s', sid) : null, bar2];
      if (tab === 'build') nodes.push(h('section', { class: 'mc-card mc-pad' }, self.stationBuild(sid)));
      else if (tab === 'tod') nodes.push(h('section', { class: 'mc-card mc-pad' }, self.todBody(sid, refresh)));
      else if (tab === 'decor') nodes.push(h('section', { class: 'mc-card mc-pad' }, self.decorBody(sid, refresh)));
      else if (!live) nodes.push(h('section', { class: 'mc-card' }, empty('metro', serviced ? '客流数据计算中' : '还没有接入运营线路', '线路开通后在这里看客流与拥挤诊断。')));
      else { const diag = self.crowdBlock(sid, k); nodes.push(h('section', { class: 'mc-card' + (diag ? ' mc-pad' : '') }, diag || empty('check', '暂无诊断', '客流数据更新后显示。'))); }
      setContent(nodes);
    };

    // ---------------- 列车管理 ----------------
    const fleetView = function () {
      setBar([['列车管理']]);
      const pg = self.page_fleet ? self.page_fleet() : null;
      setContent([h('section', { class: 'mc-card' + (pg ? ' mc-pad' : '') }, pg ? pg.el : empty('train', '还没有列车', '线路运营后在这里管理列车。'))]);
    };

    // 建设类改动进入草案：底部显示状态，可以确认、放弃或回地图查看
    const drawDraft = function () {
      const ev = g.draft ? g.draftEval() : null;
      draftBar.classList.toggle('hidden', !ev || !ev.changed);
      if (!ev || !ev.changed) { draftBar.replaceChildren(); return; }
      const can = g.canConfirm();
      draftBar.replaceChildren(ic('pencil', 15), h('span', { class: 'grow' }, h('b', null, '建设草案'), ' · ', ev.changes.add.length + ev.changes.mod.length + ev.changes.del.length + ' 项改动 · ' + U.fmtMoney(ev.total), ev.conflicts.length ? h('span', { class: 'mc-bad' }, ' · ' + ev.conflicts.length + ' 处冲突') : ''),
        h('button', { class: 'btn sm', onclick: then(function () {}) }, '回地图查看'),
        h('button', { class: 'btn sm', onclick: function () { g.cancelDraft(); } }, '放弃'),
        h('button', { class: 'btn sm primary', disabled: can.ok ? null : true, 'data-tip': can.ok ? null : can.reason, onclick: function () { const r = g.confirmDraft(); if (!r.ok) self.toast(r.reason || '不能确认', 'bad'); } }, ic('check', 13), '确认建设'));
      I18(draftBar);
    };
    const VIEWS = { home: overview, lines: linesView, stations: stationsView, fleet: fleetView, line: lineDetail, station: stationDetail };
    const draw = function () {
      if (CM.game !== g) { close(null, true); return; }
      const hadQ = document.activeElement && document.activeElement.classList.contains('mc-q');
      const keepLive = self.live;   // 详情面板的定时刷新项不受影响；App 内容按月与操作刷新
      self.live = [];
      // 界面只读线网：绘制期间共用线路与区段索引（v2.6），线路多时打开和翻页不再一次次遍历全网
      M.withSegIndex([g.net, g.draft && g.draft.net], VIEWS[st.view] || overview);
      self.live = keepLive;
      drawRail(); drawDraft();
      if (hadQ) { const q = content.querySelector('.mc-q'); if (q) { q.focus({ preventScroll: true }); q.setSelectionRange(q.value.length, q.value.length); } }
    };
    // 打开 / 收回动画与「地铁圈」相同：窗口在入口按钮与居中位置之间缩放（入口隐藏时原地淡入淡出）
    const flyFrom = function () {
      const d = self.opsDock; if (!d || d.classList.contains('hidden')) return null;
      const f = d.getBoundingClientRect(), t = app.getBoundingClientRect(); if (!f.width || !t.width) return null;
      return 'translate(' + (f.left + f.width / 2 - t.left - t.width / 2).toFixed(1) + 'px,' + (f.top + f.height / 2 - t.top - t.height / 2).toFixed(1) + 'px) scale(' + (f.width / t.width).toFixed(3) + ',' + (f.height / t.height).toFixed(3) + ')';
    };
    const key = function (e) { self.appKey(e, app, close); };
    const close = function (after, instant) {
      if (closing) return; closing = true;
      document.removeEventListener('keydown', key, true);
      if (self.opsApp === api) self.opsApp = null;
      document.body.classList.remove('ops-open');
      if (self.opsDock) self.opsDock.classList.remove('vx-on');
      if (!instant) sfx('appClose');
      const done = function () { back.remove(); app.remove(); if (after) after(); };
      if (instant || reduce || !app.animate) { done(); return; }
      const fr = flyFrom();
      back.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 260, fill: 'forwards' });
      app.animate(fr ? [{ transform: 'none', opacity: 1, borderRadius: '22px' }, { transform: fr, opacity: 0.15, borderRadius: '60px' }] : [{ transform: 'none', opacity: 1 }, { transform: 'scale(.94)', opacity: 0 }], { duration: 300, easing: 'cubic-bezier(.5,0,.75,0)', fill: 'forwards' }).onfinish = done;
    };
    // 数据刷新（买车、换月等）不重放进场动画，也不改变滚动位置
    const api = { close: close, go: go, refresh: function () { if (closing) return; app.classList.add('quiet'); const t = content.scrollTop; draw(); content.scrollTop = t; }, el: app, state: function () { return { root: st.root, view: st.view, id: st.id, tab: st.view === 'line' ? st.tab.line : (st.view === 'station' ? st.tab.station : null) }; } };
    this.opsApp = api;
    sfx('appOpen');
    document.body.classList.add('ops-open');
    this.hideOpsPop();
    app.append(rail, h('div', { class: 'mc-body' }, bar, content, draftBar));
    document.getElementById('app').append(back, app);
    if (this.opsDock) this.opsDock.classList.add('vx-on');
    if (view) go(view, id); else draw();
    document.addEventListener('keydown', key, true);
    if (!reduce && app.animate) {
      const fr = flyFrom();
      back.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 320, easing: 'ease-out' });
      app.animate(fr ? [{ transform: fr, opacity: 0.3, borderRadius: '60px' }, { transform: 'none', opacity: 1, borderRadius: '22px' }] : [{ transform: 'scale(.94)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 460, easing: 'cubic-bezier(.16,1,.3,1)' });
      for (const el of [rail, bar, content]) el.animate([{ opacity: 0 }, { opacity: 0, offset: 0.3 }, { opacity: 1 }], { duration: 460 });
    }
    app.focus({ preventScroll: true });
  };
})(window.CM);
