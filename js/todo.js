'use strict';
// 待办（v3.4）：并在「任务」面板里的第一个分页，不另设入口。把需要玩家处理的事集中在一处、按轻重排序：
// 紧急（经营挑战失败与财政预警、任务 3 个月内到期、线路或车站严重过载、合同建设期限不到半年）→ 需要关注（任务 12 个月内到期、过载、
// 新的招标、票价提醒、待接受的挑战）→ 提醒（效果报告、已达标等待结算）→ 近期动态（城市纪事里最近三个月的任务、合同、建设、运营与城市大事，只看不计数）。
// 任务按钮的角标显示待办数（有紧急事项时为红色），没有待办时显示进行中的任务数。地铁芯的过载提醒不再弹出浮动卡片，改为一条可直达待办的提示。
// 只读取已有的模拟与经营结果，不改变规则；各项处理沿用原有入口（地铁芯自动处理、任务、合同、财政、票价）。
(function (CM) {
  const U = CM.U, h = U.h, ic = function (n, s) { return CM.icon(n, s); };
  const Todo = CM.Todo = {};
  const ORDER = { urgent: 0, warn: 1, info: 2 };
  const LEVEL = { urgent: ['紧急', 'error'], warn: ['需要关注', 'warn'], info: ['提醒', 'info'] };
  const RECENT_TAGS = { '任务': 'flag', '合同': 'briefcase', '建设': 'hammer', '运营': 'train', '里程碑': 'trophy', '史实': 'book', '特色': 'sparkle', '经济': 'trend', '模拟': 'book' };
  const goTasks = function (ui, tab) { return function () { ui.taskTab = tab; ui.openPage('tasks', tab, { root: true }); }; };

  // 当前的待办事项：[{ key, level, icon, cat, title, sub, p, acts: [[文字, 函数, 主按钮]] }]
  Todo.collect = function (g, ui, light) {   // light：只数数（任务按钮角标），不算自动处理方案
    const out = [], ym = g.ym(), T = g.tasks, E = g.econ;
    if (!T || g.tutorial) return out;
    // 经营失败与财政、满意度、票价预警
    if (E.failed) out.push({ key: 'fail', level: 'urgent', icon: 'error', cat: '经营', title: '经营挑战已失败', sub: '可以查看原因、读档或转为自由建造', acts: [['查看', function () { ui.showFailure(E.failed); }, true]] });
    for (const w of E.warnings()) {
      const fare = w.text.indexOf('票价') === 0, k = w.text.indexOf('：'), sat = w.text.indexOf('交通') === 0;
      out.push({ key: 'w:' + w.text.slice(0, 6), level: w.level === 'danger' ? 'urgent' : 'warn', icon: fare ? 'ticket' : (sat ? 'frown' : 'coin'), cat: fare ? '票价' : (sat ? '满意度' : '财政'),
        title: k > 0 ? w.text.slice(0, k) : w.text, sub: k > 0 ? w.text.slice(k + 1) : '',
        acts: [[fare ? '调整票价' : (sat ? '查看满意度' : '查看财政'), function () { if (fare) ui.openOpsApp('fare'); else if (sat) ui.openVoicesApp('sat'); else ui.openTop('money'); }, true]] });
    }
    // 任务：12 个月内到期的进行中任务；已达标的只提醒结算时间
    for (const t of T.active) {
      if (!t.deadline) continue;
      const left = U.ymIndex(t.deadline[0], t.deadline[1]) - ym; if (left > 12) continue;
      const ev = t.progress || null, ok = !!(ev && ev.ok), p = ev && isFinite(ev.value) ? U.clamp(ev.value, 0, 1) : null;
      out.push({ key: 't:' + t.id, level: ok ? 'info' : (left <= 3 ? 'urgent' : 'warn'), icon: 'flag', cat: '任务', title: t.title,
        sub: ok ? '已达标，到期时结算' : (left > 0 ? '还剩 ' + left + ' 个月' : '本月到期') + (p != null ? ' · 完成约 ' + Math.round(p * 100) + '%' : ''), p: ok ? null : p,
        acts: [['查看任务', goTasks(ui, 'active'), true]] });
    }
    // 待接受的可选挑战
    for (const o of T.offers || []) out.push({ key: 'o:' + o.id, level: 'warn', icon: 'trophy', cat: '可选挑战', title: '可接受的挑战：' + o.title, sub: o.expiresYM != null ? '还可接受 ' + Math.max(0, o.expiresYM - ym) + ' 个月' : '', acts: [['查看挑战', goTasks(ui, 'active'), true]] });
    // 地铁芯的过载提醒：自动处理、定位处理或一年内不提醒
    const A = CM.OpsAlerts;
    if (A) for (const x of A.active(g)) {
      const plan = light ? { ok: false, text: "" } : A.plan(g, x);
      out.push({ key: x.key, level: x.level === 'bad' ? 'urgent' : 'warn', icon: x.kind === 'line' ? 'route' : 'station', cat: '运营', title: x.title, sub: x.sub || '', note: plan.text ? (plan.ok ? '建议：' + plan.text : plan.text) : '',
        acts: [plan.ok ? ['自动处理' + (plan.cost > 0.5 ? ' · ' + U.fmtMoney(plan.cost) : ''), function () {
          const r = A.run(g, ui, x);
          if (r.error) { ui.toast(r.error, 'bad'); return; }
          ui.toast(r.drafted ? '已放入草案，确认建设后生效：' + r.text : '已处理：' + r.text, r.drafted ? 'info' : 'good'); ui.rerenderPage();
        }, true] : null, ['定位处理', function () { A.locate(g, ui, x); }], ['一年内不提醒', function () { A.snooze(g, ui, x); ui.rerenderPage(); }, false, true]].filter(Boolean) });
    }
    // 政府合同：可投标的招标、建设期限一年内的合同
    if (g.corp && CM.Corp && CM.Corp.enabled(g)) {
      const goPPP = goTasks(ui, 'ppp');
      for (const t of g.corp.tenders) if (!t.bid && t.expires >= ym) out.push({ key: 'td:' + t.id, level: 'warn', icon: 'briefcase', cat: '合同', title: '招标：' + t.title, sub: '还可投标 ' + Math.max(0, t.expires - ym) + ' 个月', acts: [['查看合同', goPPP, true]] });
      for (const c of g.corp.contracts) {
        if (c.phase !== 'build') continue;
        const left = c.deadline - ym; if (left > 12) continue;
        const p = c.prog && isFinite(c.prog.v) ? U.clamp(c.prog.v, 0, 1) : null;
        out.push({ key: 'ct:' + c.id, level: left <= 6 ? 'urgent' : 'warn', icon: 'briefcase', cat: '合同', title: c.title, sub: '建设期限还剩 ' + Math.max(0, left) + ' 个月' + (p != null ? ' · 完成约 ' + Math.round(p * 100) + '%' : ''), p: p, acts: [['查看合同', goPPP, true]] });
      }
    }
    // 建设效果报告：生成后、没打开过之前
    const ir = g.impactReport;
    if (ir && ir.status === 'done' && !ir.seen) out.push({ key: 'impact', level: 'info', icon: 'report', cat: '建设', title: '建设效果报告已生成', sub: ir.at ? ir.at[0] + ' 年 ' + ir.at[1] + ' 月的建设，开通前后对照' : '', acts: [['查看报告', function () { ui.openPage('impact', null, { root: true }); }, true]] });
    return out.map(function (x, k) { x.k = k; return x; }).sort(function (a, b) { return (ORDER[a.level] - ORDER[b.level]) || (a.k - b.k); });
  };
  // 任务按钮角标：待办数（不含提醒）与是否有紧急事项
  Todo.count = function (g, ui) {
    const now = performance.now(), c = ui._todoCnt;
    if (c && c.g === g && c.rev === g.rev && now - c.t < 500) return c.r;
    let n = 0, urgent = false;
    for (const x of Todo.collect(g, ui, true)) { if (x.level === 'info') continue; n++; if (x.level === 'urgent') urgent = true; }
    const r = { n: n, urgent: urgent }; ui._todoCnt = { g, rev: g.rev, t: now, r }; return r;
  };
  // 城市纪事里最近三个月的动态
  Todo.recent = function (g) {
    const ym = g.ym(), out = [];
    for (let k = g.events.length - 1; k >= 0 && out.length < 8; k--) {
      const e = g.events[k]; if (ym - U.ymIndex(e.y, e.m) > 2) break;
      if (!RECENT_TAGS[e.tag]) continue;
      out.push(e);
    }
    return out;
  };
  // 「任务 → 待办」分页
  Todo.render = function (ui, g, body) {
    const list = Todo.collect(g, ui);
    if (!list.length) body.appendChild(h('div', { class: 'tk-empty td-empty' }, ic('check', 26), h('b', null, '没有需要处理的事'), h('span', { class: 'tiny muted' }, '任务临期、线路过载、招标与财政预警会出现在这里')));
    let lvl = null, sec = null;
    for (const x of list) {
      if (x.level !== lvl) { lvl = x.level; const L = LEVEL[lvl]; sec = h('div', { class: 'td-sec lv-' + lvl }, h('div', { class: 'td-sec-h' }, ic(L[1], 13), L[0], h('em', null, String(list.filter(function (y) { return y.level === lvl; }).length)))); body.appendChild(sec); }
      sec.appendChild(h('div', { class: 'td-item lv-' + x.level },
        h('span', { class: 'td-ico' }, ic(x.icon, 15)),
        h('div', { class: 'td-main' },
          h('div', { class: 'td-t' }, h('span', { class: 'td-cat' }, x.cat), h('b', null, x.title)),
          x.sub ? h('div', { class: 'td-sub' }, x.sub) : null,
          x.note ? h('div', { class: 'td-sub td-note' }, x.note) : null,
          x.p != null ? h('div', { class: 'td-bar' }, h('i', { style: { width: (x.p * 100).toFixed(1) + '%' } })) : null,
          h('div', { class: 'td-acts' }, x.acts.map(function (a) { return h('button', { class: 'btn sm' + (a[2] ? ' primary' : '') + (a[3] ? ' ghost' : ''), onclick: a[1] }, a[0]); })))));
    }
    // 刚才的提示（v3.4 通知编排）：同时到来、排在后面没来得及显示的提示，都能在这里看到（本次游戏的最近 12 条）
    const notes = (ui._noteLog || []).slice(-12).reverse();
    if (notes.length) {
      const ago = function (t) { const s = Math.max(0, Math.round((Date.now() - t) / 1000)); return s < 60 ? '刚刚' : s < 3600 ? Math.floor(s / 60) + ' 分钟前' : Math.floor(s / 3600) + ' 小时前'; };
      const NI = { good: 'check', bad: 'error', warn: 'warn', info: 'info' };
      body.appendChild(h('div', { class: 'td-sec lv-recent' }, h('div', { class: 'td-sec-h' }, ic('megaphone', 13), '刚才的提示', h('em', null, String(notes.length))),
        h('ul', { class: 'td-recent td-notes' }, notes.map(function (n) { return h('li', null, h('span', { class: 'td-ri k-' + n.kind }, ic(NI[n.kind] || 'info', 12)), h('span', { class: 'td-rd' }, ago(n.t)), h('span', { class: 'td-rt' }, n.text)); }))));
    }
    const rec = Todo.recent(g);
    if (rec.length) {
      body.appendChild(h('div', { class: 'td-sec lv-recent' }, h('div', { class: 'td-sec-h' }, ic('clock', 13), '近期动态', h('button', { class: 'linkbtn', onclick: function () { ui.openStats('milestones'); } }, '城市纪事', ic('chev', 12))),
        h('ul', { class: 'td-recent' }, rec.map(function (e) { return h('li', null, h('span', { class: 'td-ri' }, ic(RECENT_TAGS[e.tag], 12)), h('span', { class: 'td-rd' }, e.y + '.' + e.m), h('span', { class: 'td-rt' }, e.title)); }))));
    }
  };
})(window.CM);
