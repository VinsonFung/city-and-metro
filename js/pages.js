'use strict';
// 详情页面：建设预测、车站、线路、道路、片区、指标、日期、财政、任务、存档、帮助
(function (CM) {
  const AX = CM.Accessibility;
  const U = CM.U, CFG = CM.CFG, D = CM.DATA, M = CM.Metro;
  const h = U.h, ic = CM.icon;
  const UI = CM.UI;
  const ICON = { chev: CM.ICON.chev, loc: CM.ICON.locate };
  // 线路配色（v2.1）：常见地铁线路颜色，按色相排列
  const LINE_PALETTE = ['#e4002b', '#b5121b', '#ef7c8e', '#e87722', '#f8a51c', '#ffd100', '#97d700', '#00a651', '#1b7a3e', '#00a3ad', '#009fe3', '#0072ce', '#003da5', '#5b4fa8', '#7d4ea8', '#c06eb8', '#8c5e3c', '#a8a9ad', '#5c6670', '#2a2a2a'];
  UI.LINE_PALETTE = LINE_PALETTE;   // 地图快捷操作（quick.js）的调色气泡共用
  // 即时显示修改也写入已有撤销点；撤销建设只恢复线网结构，不撤销已经生效的改名、改色。
  function patchDisplay(g, kind, id, patch) {
    const apply = function (net) { if (net && net[kind][id]) Object.assign(net[kind][id], patch); };
    apply(g.net);
    const d = g.draft;
    if (d) {
      apply(d.net);
      const update = function (text) { const net = JSON.parse(text); if (!net[kind][id]) return text; apply(net); return JSON.stringify(net); };
      d.undo = d.undo.map(update); d.redo = d.redo.map(update);
      if (d.liveSnap) d.liveSnap = update(d.liveSnap);
      d.evalVer = -1;
    }
    // 运营路线的颜色和方向名称是编译时的显示副本，无须重建交通网络即可刷新。
    const compiled = new Set([g.compiled, g.model && g.model.net && g.model.net.C, d && d.compiled]);
    for (const C of compiled) if (C) for (const r of C.routes) {
      const line = C.net.lines[r.lineId]; if (!line) continue;
      r.color = line.color; r.label = line.name;
      if (r.svc) { const sv = (line.svcs || []).find(function (x) { return x.id === r.svc; }); if (sv) r.label = M.svcLabel(line, sv); continue; }
      if (r.branch) {
        const leaf = r.stIds[r.stIds.length - 1], name = line.branchNames && line.branchNames[leaf], st = C.net.stations[leaf];
        r.label = name ? line.name + ' ' + name : (r.main ? line.name : line.name + '（往' + (st ? st.name : '') + '）');
      }
    }
    g.touch();
  }
  // 修改线路名称或颜色：只影响显示，运营网络与草案同时更新，立即生效、不产生费用
  UI.prototype.setLineLook = function (lid, patch) {
    const g = this.g(); if (!g || this._replacingPage || this._replacingToolOpts) return;
    patchDisplay(g, 'lines', lid, patch);
    const R = this.R; R.labelImage = null; R.metroOrder = null; R._smC = null;
    if (CM.NetMap) CM.NetMap.refresh(true);
    if (CM.Stats && CM.Stats.isOpen()) CM.Stats.redraw();
    this.markUnsaved(); this.scheduleAutosave();
    this.renderToolOpts && this.renderToolOpts();
    if (patch.name || patch.branchNames) this.rerenderPage(); else if (this.opsApp) this.opsApp.refresh();
  };
  // 车站更名（v2.1 玩家反馈）：与线路名称、颜色一样立即生效、不收费、不进入建设草案；同时写入正式网络与草案
  UI.prototype.setStationName = function (id, name) {
    const g = this.g(); if (!g) return { error: '没有进行中的游戏' };
    name = String(name || '').trim().slice(0, 16);
    if (!name) return { error: '站名不能为空' };
    const nets = [g.net, g.draft && g.draft.net].filter(Boolean), cur = nets[nets.length - 1].stations[id];
    if (!cur) return { error: '车站已不存在' };
    if (cur.name === name) return { same: true };
    for (const n of nets) for (const sid in n.stations) if (sid !== id && n.stations[sid].name === name) return { error: '已有同名车站「' + name + '」，请换一个名称' };
    const old = cur.name;
    patchDisplay(g, 'stations', id, { name: name });
    if (g.draft) { g.draft.evalVer = -1; this.renderDraftbar(); }   // 草案说明里的站名随之更新（不改变草案内容与预测）
    const R = this.R; R.labelImage = null; R.metroOrder = null;
    if (CM.NetMap) CM.NetMap.refresh(true);
    if (CM.Stats && CM.Stats.isOpen()) CM.Stats.redraw();
    this.markUnsaved(); this.scheduleAutosave();
    this.rerenderPage();
    return { ok: true, old: old };
  };
  UI.sgnPeople = function (d) { return Math.abs(d) < 0.5 ? '±0' : (d > 0 ? '+' : '−') + U.fmtPeople(Math.abs(d)); };
  UI.prototype.predictionBlock = function () {
    const g = this.g(), self = this, d = g.draft;
    const box = h('div', { class: 'sec open' });
    box.appendChild(h('div', { class: 'sec-h', style: { cursor: 'default' } }, '效果预测', h('span', { class: 'sum' }, '仅供参考')));
    const inner = h('div', { class: 'inner', style: { padding: '0 2px 10px' } });
    box.appendChild(inner);
    if (!d) return box;
    const p = d.pred;
    const runBtn = function (label) { return h('button', { class: 'btn sm', onclick: function () { g.requestPrediction(); } }, label); };
    if (p.state === 'idle') {
      inner.append(h('div', { class: 'note' }, '在草案静止约 1 秒后自动计算，或手动开始。预测基于当前城市状态比较建线前后的出行选择与道路交通。'), h('div', { style: { marginTop: '6px' } }, runBtn('计算效果预测')));
      return box;
    }
    if (p.state === 'running') {
      const bar = h('i', { style: { width: '5%' } });
      inner.append(h('div', { class: 'row small muted', style: { marginBottom: '6px' } }, h('span', { class: 'spinner', style: { width: '14px', height: '14px', borderWidth: '2px' } }), '预测计算中（不扣费，不改变正式客流）…'), h('div', { class: 'progress' }, bar));
      this.live.push(function () { const st = g.model.predState; bar.style.width = Math.round(U.clamp(st ? st.progress : 0.05, 0.05, 1) * 100) + '%'; });
      return box;
    }
    const res = p.state === 'done' ? p.result : (p.last || null);
    if (p.state === 'stale') inner.append(h('div', { class: 'callout warn' }, p.msg || '草案已修改，预测需要重新计算'), h('div', { style: { margin: '4px 0 8px' } }, runBtn('重新计算')));
    if (!res) return box;
    const dim = p.state === 'stale';
    const wrap = h('div', { style: { opacity: dim ? 0.5 : 1 } });
    inner.appendChild(wrap);
    if (!res.valid) { wrap.appendChild(h('div', { class: 'callout warn' }, '无法形成有效预测：' + (res.reason || '草案中没有有效的地铁行程。'))); }
    else {
      const B = res.base, Dr = res.draft;
      const dlt = function (a, b, d0, unit, betterUp) { const x = b - a; if (Math.abs(x) < Math.pow(10, -d0) / 2) return ['±0' + (unit || ''), 'muted']; return [U.fmtSigned(x, d0, unit || ''), (x > 0) === betterUp ? 'good' : 'bad']; };
      const g1 = h('div', { class: 'stat-grid' });
      let x;
      x = dlt(B.metro, Dr.metro, 0, '', true); g1.appendChild(this.stat('日均地铁客运量（周平均）', U.fmtPeople(Dr.metro) + ' 人次', '较当前 ' + U.fmtSigned((Dr.metro - B.metro) / 1e4, 1, ' 万'), x[1]));
      x = dlt(B.metroShare * 100, Dr.metroShare * 100, 1, ' 个百分点', true); g1.appendChild(this.stat('地铁分担率', U.fmtPct(Dr.metroShare), x[0], x[1]));
      x = dlt(B.commute, Dr.commute, 1, ' 分钟', false); g1.appendChild(this.stat('平均通勤时间', U.fmtNum(Dr.commute, 1) + ' 分钟', x[0], x[1]));
      x = dlt(B.cong, Dr.cong, 3, '', false); g1.appendChild(this.stat('道路拥堵指数（全日）', Dr.cong.toFixed(3), x[0], x[1]));
      x = dlt(B.car, Dr.car, 0, '', false); g1.appendChild(this.stat('非地铁出行（人次/日）', U.fmtPeople(Dr.car), (Dr.car<=B.car?'减少 ':'增加 ')+U.fmtPeople(Math.abs(B.car-Dr.car))+' 人次', x[1]));
      x = dlt(B.fare, Dr.fare, 0, '', true); g1.appendChild(this.stat('票务收入（日）', U.fmtMoney(Dr.fare / 10000), U.fmtSigned(U.cur(Dr.fare - B.fare) / 10000, 1, ' ' + CFG.money.wan), x[1]));
      wrap.appendChild(g1);
      // 预测解读（v2.3）：与建成后的建设效果报告同一套归因
      if (res.stations) wrap.appendChild(this.sec('pr-why', '预计会怎样，为什么', '', function () {
        return CM.Impact.view(self, res, { pred: true, noKpi: true, ops: CM.Impact.opsInputs(g, g.compiled, g.draftCompiled()) });
      }, true, 'help'));
      // 工作日与周末对比（v1.9）
      if (res.wk && res.we) {
        const arrow = function (a, b, fmt, up) { const d = b - a, cls = Math.abs(d) < 1e-9 ? 'muted' : ((d > 0) === up ? 'good' : 'bad'); return h('td', null, fmt(a) + ' → ', h('b', { class: cls }, fmt(b))); };
        const pct = function (v) { return U.fmtPct(v, 1); }, ppl = function (v) { return U.fmtPeople(v); }, f3 = function (v) { return v.toFixed(3); };
        const t = h('table', { class: 'tbl' }, h('tr', null, h('th', null, ''), h('th', null, '工作日'), h('th', null, '周末')),
          h('tr', null, h('td', null, '地铁客运量'), arrow(res.wk.base.metro, res.wk.draft.metro, ppl, true), arrow(res.we.base.metro, res.we.draft.metro, ppl, true)),
          h('tr', null, h('td', null, '地铁分担率'), arrow(res.wk.base.metroShare, res.wk.draft.metroShare, pct, true), arrow(res.we.base.metroShare, res.we.draft.metroShare, pct, true)),
          h('tr', null, h('td', null, '道路拥堵指数'), arrow(res.wk.base.cong, res.wk.draft.cong, f3, false), arrow(res.we.base.cong, res.we.draft.cong, f3, false)));
        const ind = res.induced || { wd: 0, we: 0, wd0: 0, we0: 0 };
        wrap.appendChild(this.sec('pr-days', '工作日与周末', '典型的一天', function () {
          return h('div', null, t, h('div', { class: 'note', style: { marginTop: '6px' } }, '工作日通勤、上学集中在早晚高峰；周末购物与旅游休闲出行更多、高峰平缓。草案改善可达性后新增的购物、休闲出行（有上限）：工作日约 ' + U.fmtPeople(Math.max(0, ind.wd - ind.wd0)) + ' 人次、周末约 ' + U.fmtPeople(Math.max(0, ind.we - ind.we0)) + ' 人次（已计入客运量）。'));
        }, true));
      }
      // 出行目的（地铁出行，人次/日）
      if (res.purpose) {
        const TR = CFG.trips;
        const t = h('table', { class: 'tbl' }, h('tr', null, h('th', null, '目的'), h('th', null, '工作日'), h('th', null, '周末')));
        for (const r of res.purpose) {
          if (r.wd1 < 1 && r.we1 < 1 && r.wd0 < 1) continue;
          const cell = function (a, b) { const d = b - a; return h('td', null, U.fmtPeople(b), h('small', { class: d > 0.5 ? 'good' : (d < -0.5 ? 'bad' : 'muted') }, ' ' + UI.sgnPeople(d))); };
          t.appendChild(h('tr', null, h('td', null, h('span', { class: 'dot', style: { background: AX.category(TR.keys.indexOf(r.key), TR.color[r.key]), marginRight: '6px' } }), TR.name[r.key]), cell(r.wd0, r.wd1), cell(r.we0, r.we1)));
        }
        wrap.appendChild(this.sec('pr-purp', '地铁出行的目的（人次/日）', '草案 · 较当前', function () { return h('div', null, t, h('div', { class: 'note', style: { marginTop: '6px' } }, '通勤与上学看工作日，购物与旅游休闲看周末；枢纽接驳为往返火车站、机场的旅客。')); }, true));
      }
      // 重点设施预计客流贡献（乘地铁到达与离开，人次/日）
      if (res.fac && res.fac.length) {
        wrap.appendChild(this.sec('pr-fac', '重点设施的地铁客流', res.fac.length + ' 处变化', function () {
          const bx = h('div');
          const t = h('table', { class: 'tbl' }, h('tr', null, h('th', null, '设施'), h('th', null, '工作日'), h('th', null, '周末')));
          for (const r of res.fac.slice(0, 8)) {
            const f = CM.Fac.byId(r.id), cell = function (a, b) { const d = b - a; return h('td', null, h('b', { class: d > 0 ? 'good' : (d < 0 ? 'bad' : 'muted') }, UI.sgnPeople(d)), h('small', { class: 'muted' }, ' 共 ' + U.fmtPeople(b))); };
            t.appendChild(h('tr', { class: 'clickable', onclick: function () { self.select({ kind: 'facility', id: r.id }); } }, h('td', null, f ? ic(f.T.icon) : null, ' ', r.name, f && f.ext ? h('small', { class: 'muted' }, f.ext.gate ? ' 接驳口' : ' 地图外') : null), cell(r.wd0, r.wd1), cell(r.we0, r.we1)));
          }
          bx.appendChild(t);
          bx.appendChild(h('div', { class: 'note', style: { marginTop: '6px' } }, '乘地铁到达与离开设施的人次（日）。车站、机场的旅客量不会因修地铁而增加，变化来自改乘地铁的接驳出行。'));
          return bx;
        }, true));
      }
      if (res.lines.length) {
        wrap.appendChild(this.sec('pr-lines', '相关线路客流（日上车人次）', '', function () {
          const t = h('table', { class: 'tbl' }, h('tr', null, h('th', null, '线路'), h('th', null, '当前'), h('th', null, '草案')));
          for (const l of res.lines) t.appendChild(h('tr', null, h('td', null, h('span', { class: 'swatch', style: { background: AX.line(l), marginRight: '6px' } }), l.name), h('td', null, U.fmtPeople(l.before)), h('td', null, U.fmtPeople(l.after))));
          return t;
        }, true));
      }
      wrap.appendChild(this.sec('pr-roads', '道路影响（工作日早高峰拥堵指数）', res.roads.length ? res.roads.length + ' 条变化' : '变化不明显', function () {
        const bx = h('div');
        if (!res.roads.length) bx.appendChild(h('div', { class: 'note' }, '早高峰主要道路拥堵指数变化不明显。新增地铁不保证道路拥堵一定改善。'));
        for (const r of res.roads) bx.appendChild(h('div', { class: 'chg small' }, h('span', null, r.name), h('span', { class: 'num ' + (r.delta < 0 ? 'good' : 'bad') }, r.vc0.toFixed(2) + ' → ' + r.vc1.toFixed(2))));
        if (res.roadsWorse.length) { bx.appendChild(h('div', { class: 'small bad', style: { marginTop: '6px' } }, '可能加重的道路：')); for (const r of res.roadsWorse) bx.appendChild(h('div', { class: 'chg small' }, h('span', null, r.name), h('span', { class: 'num bad' }, r.vc0.toFixed(2) + ' → ' + r.vc1.toFixed(2)))); }
        return bx;
      }, true));
    }
    const c = res.conditions;
    const fare = UI.fareText(c.fare, true);
    wrap.appendChild(this.sec('pr-cond', '预测条件与说明', '', function () {
      return h('div', { class: 'note' }, '比较对象：当前正式网络 vs 草案网络；城市状态：' + c.y + '年' + c.m + '月（相同人口、岗位、设施与出行需求）；时间范围：典型工作日与典型周末各一天（早高峰、平峰、晚高峰、夜间），日均为周平均（5 个工作日 + 2 个周末日）；票价：' + fare + '；运力：系统按预测客流自动调整。预测仅供参考，不扣费、不改变正式客流；投运后的实际结果由模拟产生，并在车站与线路详情中单独显示。');
    }));
    return box;
  };

  // 指标详情（拥堵、分担率）里的最近一次建设效果：结论一句话 + 完整报告入口（v2.3）
  UI.prototype.trafficImpactBlock=function(){
    const g=this.g(),r=g.impactReport;if(!r)return h('div');
    if(r.status!=='done')return h('div',{class:'callout info'},'正在评估本次建设的交通效果，完成后可在这里查看。');
    const self=this,A=CM.Impact.analyze(r,g),body=h('div');
    if(A)body.appendChild(h('p',{class:'imp-verdict'},A.verdict));
    body.appendChild(h('div',{class:'row',style:{flexWrap:'wrap',gap:'6px'}},
      h('button',{class:'btn sm primary',onclick:()=>self.openPage('impact')},ic('report',14),'建设效果报告'),
      h('button',{class:'btn sm ghost',onclick:()=>{self.R.layerOpt.cong='am';self.setLayer('cong');}},ic('lyCong',14),'查看工作日早高峰')));
    return this.sec('traffic-impact','最近一次建设的效果',r.at[0]+'年'+r.at[1]+'月',()=>body,true);
  };
  // ======================== 页面：建设效果报告（v2.3） ========================
  // 关键数字（分担率、通勤、客运量、运营盈亏）→ 为什么 → 可以尝试 → 沿线车站客流 → 道路变化 → 对照口径
  UI.prototype.page_impact=function(){
    const g=this.g(),r=g.impactReport,self=this,el=h('div');
    if(!r){el.appendChild(h('div',{class:'tk-empty'},ic('report',26),h('b',null,'还没有建设效果报告'),h('span',null,'确认建设后，系统会以相同的人口、岗位、道路和票价，对比保留与撤回这次建设的网络，生成报告。')));return{title:'建设效果报告',el};}
    if(r.status!=='done'){el.appendChild(h('div',{class:'callout info'},h('span',{class:'spinner',style:{width:'14px',height:'14px',borderWidth:'2px'}}),'正在评估本次建设的交通效果（不影响游戏进行），完成后自动显示。'));return{title:'建设效果报告',el};}
    el.appendChild(h('div',{class:'tiny muted',style:{margin:'0 0 6px'}},r.at[0]+'年'+r.at[1]+'月建成'+(r.summary?' · '+r.summary:'')+(r.cost>0?' · 费用 '+U.fmtMoney(r.cost):'')));
    if(r.lines&&r.lines.length)el.appendChild(h('div',{class:'row',style:{flexWrap:'wrap',gap:'4px',marginBottom:'6px'}},r.lines.map(l=>h('span',{class:'tag clickable',style:{background:AX.line(l)+'22',color:AX.line(l)},onclick:()=>{if(g.net.lines[l.id])self.openPage('line',l.id);}},'● '+l.name+' · 日上车 '+U.fmtPeople(l.after)+' 人次'))));
    el.appendChild(CM.Impact.view(this,r,{open:true}));
    const roads=[...(r.roads||[]),...(r.roadsWorse||[])];
    el.appendChild(this.sec('imp-roads','道路变化（工作日早高峰拥堵指数）',roads.length?roads.length+' 条':'变化不明显',function(){
      const b=h('div');
      for(const road of roads)b.appendChild(h('div',{class:'chg small'},h('span',null,road.name),h('b',{class:road.delta<0?'good':'bad'},road.vc0.toFixed(2)+' → '+road.vc1.toFixed(2))));
      if(!roads.length)b.appendChild(h('div',{class:'note'},'主要道路拥堵指数变化不明显。'));
      b.appendChild(h('button',{class:'btn sm ghost',style:{marginTop:'6px'},onclick:()=>{self.R.layerOpt.cong='am';self.setLayer('cong');}},ic('lyCong',14),'查看工作日早高峰'));
      return b;
    },false,'road'));
    el.appendChild(this.sec('imp-cond','对照口径','',()=>h('div',{class:'note'},'以评估时相同的人口、岗位、道路和票价，对比保留与撤回本次建设的网络；日均为周平均（5 个工作日 + 2 个周末日），拥堵为工作日早高峰。运营盈亏只计本次建设带来的票款与运营成本变化（列车车公里与车站），不含建设费、拨款与债务。客运量增加不等于减少同量汽车。'+(r.stable?'':'部分结果尚未完全稳定，数值为近似估计。')),false,'info'));
    return{title:'建设效果报告',el};
  };

  // ======================== 车站商业开发（TOD，v2.3） ========================
  // 只选择是否开发与投入等级：一次投入，之后按本站客流逐日取得广告与租金收入（换乘站有枢纽溢价）；只能升级，不退还。
  // 车站详情页与地图快捷操作（quick.js）共用同一组控件；after 为操作完成后的刷新
  UI.prototype.todInfo = function (id) {
    const g = this.g(), T = CM.TOD, s = g.net.stations[id], C = g.model.net ? g.model.net.C : null, k = C ? C.sIndex.get(id) : undefined;
    if (!s || k === undefined || !C.serviced[k]) return null;
    const sd = g.model.stDaily, flow = sd && k < sd.inn.length ? sd.inn[k] + sd.out[k] + sd.xfer[k] : 0, hub = !!(C.stationLines[k] && C.stationLines[k].size >= 2);
    // month：每月收入（含经济周期）；cost：每月运营与维护成本；net：净收益（v2.5）
    const month = function (l) { return T.stationDaily(l, flow, hub, g.clock.y, g) * 30.4; }, cost = function (l) { return T.stationCost(l, g.clock.y, s.size, hub) * 30.4; };
    return { s: s, lv: s.tod || 0, flow: flow, hub: hub, month: month, cost: cost, net: function (l) { return month(l) - cost(l); } };
  };
  UI.prototype.todBody = function (id, after) {
    const g = this.g(), self = this, T = CM.TOD, I = this.todInfo(id), free = g.econ.isFree();
    if (!I) return h('div', { class: 'note' }, '车站接入运营线路后才能开发商业空间。');
    const s = I.s, lv = I.lv, b = h('div'), lines = M.stationLines(g.net, id).map(function (l) { return g.net.lines[l]; }).filter(Boolean);
    // 预览：左边是现在，右边是开发后；鼠标移到某一级上时右边换成那一级
    const nextBox = h('div', { class: 'st-artbox' }), nextCap = h('figcaption');
    const showLv = function (l) { nextBox.innerHTML = self.stationArt(s, lines, { tod: l }); nextCap.textContent = CM.I18n ? CM.I18n.text('开发后 · ' + T.LEVELS[l].name) : '开发后 · ' + T.LEVELS[l].name; };
    const topLv = T.LEVELS.length - 1;
    if (lv < topLv) showLv(lv + 1);
    b.appendChild(h('div', { class: 'st-arts' }, h('figure', null, h('div', { class: 'st-artbox', html: self.stationArt(s, lines) }), h('figcaption', null, '现在 · ' + T.LEVELS[lv].name)), lv < topLv ? h('figure', null, nextBox, nextCap) : null));
    b.appendChild(h('div', { class: 'note' }, '车站客流越大，广告与商铺租金越多' + (I.hub ? '；换乘站人流集中，收入 ×' + T.HUB : '') + '。日客流约 ' + U.fmtPeople(I.flow) + ' 人次。开发后每年有运营与维护成本，客流太少会亏损；商业街与站城一体的收入随经济周期涨落。'));
    const list = h('div', { class: 'tod-levels' });
    T.LEVELS.forEach(function (L, l) {
      if (!l) return;
      // 回本按净收益（收入 − 运营与维护成本）；升级的净收益增量对应升级投入
      const cost = Math.max(0, T.cost(l, g.clock.y, s.size, I.hub) - T.cost(lv, g.clock.y, s.size, I.hub)), inc = I.month(l), net = I.net(l), gain = net - (lv ? I.net(lv) : 0), pay = gain > 0 ? cost / (gain * 12) : Infinity, on = l <= lv;
      list.appendChild(h('div', { class: 'tod-lv' + (on ? ' on' : ''), onpointerenter: function () { if (l > lv) showLv(l); }, onpointerleave: function () { if (lv < topLv) showLv(lv + 1); } },
        h('div', { class: 'grow' }, h('b', null, l + ' · ' + L.name), h('small', null, L.desc),
          h('small', null, '每月收入约 ' + U.fmtMoney(inc) + '，成本约 ' + U.fmtMoney(I.cost(l))),
          h('small', { class: net < 0 ? 'bad' : '' }, net < 0 ? '按目前客流每月亏损约 ' + U.fmtMoney(-net) : '每月净收益约 ' + U.fmtMoney(net) + (on ? '' : ' · 投入 ' + U.fmtMoney(cost) + (isFinite(pay) ? ' · 约 ' + U.fmtNum(pay, pay < 10 ? 1 : 0) + ' 年回本' : ' · 难以回本')))),
        on ? h('span', { class: 'tag good' }, l === lv ? '经营中' : '已含') : h('button', { class: 'btn sm' + (l === lv + 1 ? ' primary' : ''), disabled: l !== lv + 1 ? true : null, onclick: function () {
          if (!free && !g.econ.canAffordBuild(cost)) { self.toast('资金不足：需要 ' + U.fmtMoney(cost), 'bad'); return; }
          g.econ.spendBuild({ construction: cost }, '车站商业开发：' + s.name + ' → ' + L.name, { y: g.clock.y, m: g.clock.m, d: g.clock.d }, true);
          patchDisplay(g, 'stations', id, { tod: l });
          self.R._smC = null;
          g.logEvent({ tag: '经营', title: '车站商业开发：' + s.name, desc: L.name + (cost > 0 ? '，投入 ' + U.fmtMoney(cost) : '') + '，预计每月收入约 ' + U.fmtMoney(inc) + '、净收益约 ' + U.fmtMoney(net) });
          if (CM.Sound) CM.Sound.play('develop');
          self.toast(s.name + ' 开始' + L.name + '：每月净收益约 ' + U.fmtMoney(net), net < 0 ? 'warn' : 'good');
          self.markUnsaved(); self.scheduleAutosave(); if (after) after();
        } }, '开发')));
    });
    b.appendChild(list);
    // 地铁带动发展（v2.3）：开发等级同时提高车站对周边新增人口与岗位的吸引
    b.appendChild(h('div', { class: 'note' }, ic('trend', 13), ' 开发等级越高，车站对周边约 1 km 新增人口与岗位的吸引越强，几年后这里会更繁华；城市发展图层 →「地铁带动」可以查看。'));
    if (free) b.appendChild(h('div', { class: 'note' }, '自由建造：资金不限，收入只作参考。'));
    return b;
  };
  UI.prototype.todBlock = function (id) {
    const self = this, T = CM.TOD, I = this.todInfo(id), lv = I ? I.lv : 0;
    const net = lv ? I.net(lv) : 0;
    return this.sec('st-tod', '商业开发（TOD）', lv ? T.LEVELS[lv].name + ' · 每月净' + (net < 0 ? '亏 ' : '收 ') + U.fmtMoney(Math.abs(net)) : '未开发', function () { return self.todBody(id, function () { self.rerenderPage(); }); }, !!lv, 'bag');
  };
  // ======================== 车站文化与装修（v2.3，纯视觉） ========================
  // 建筑风格、主题色、公共艺术与标识风格只改变车站模型的外观，不影响客流与经营；「翻新」让随年代的外观更新到当前年代
  UI.DECOR = {
    style: [['auto', '随年代'], ['heritage', '复古'], ['modern', '现代简约'], ['tech', '科技未来'], ['garden', '园林'], ['industrial', '工业风']],
    art: [['none', '无'], ['sculpture', '雕塑'], ['mural', '壁画'], ['light', '光影装置'], ['memory', '城市记忆墙']],
    sign: [['std', '标准'], ['enamel', '复古珐琅'], ['neon', '霓虹'], ['minimal', '极简']],
  };
  UI.DECOR_COLORS = ['#c0392b', '#d4a017', '#2e7d32', '#1565c0', '#6a1b9a', '#00838f', '#5d4037', '#37474f'];
  // 批量操作（地铁芯车站管理）：开发到某一等级的报价。已达到该等级、还没接入运营线路的车站跳过；投入与逐级升级的总和相同
  UI.prototype.batchTodQuote = function (ids, level) {
    const self = this, T = CM.TOD, y = this.g().clock.y, q = { level: level, items: [], cost: 0, skip: 0, loss: 0 };
    Array.from(new Set(ids)).forEach(function (id) {
      const I = self.todInfo(id);
      if (!I || I.lv >= level) { q.skip++; return; }
      const cost = Math.max(0, T.cost(level, y, I.s.size, I.hub) - T.cost(I.lv, y, I.s.size, I.hub));
      q.items.push({ id: id, cost: cost }); q.cost += cost; if (I.net(level) < 0) q.loss++;
    });
    return q;
  };
  UI.prototype.applyBatchTod = function (q) {
    const g = this.g(), L = CM.TOD.LEVELS[q.level];
    const current = this.batchTodQuote(q.items.map(function (it) { return it.id; }), q.level);
    if (!L || current.items.length !== q.items.length || Math.abs(current.cost - q.cost) > 0.001) return { error: '开发报价已变化，请重新选择开发等级后确认' };
    if (!q.items.length) return { error: '所选车站都已达到这一等级或还没有接入运营线路' };
    if (!g.econ.isFree() && !g.econ.canAffordBuild(q.cost)) return { error: '资金不足：需要 ' + U.fmtMoney(q.cost) };
    g.econ.spendBuild({ construction: q.cost }, '车站商业开发：' + q.items.length + ' 座车站 → ' + L.name, { y: g.clock.y, m: g.clock.m, d: g.clock.d }, true);
    for (const it of q.items) patchDisplay(g, 'stations', it.id, { tod: q.level });
    this.R._smC = null;
    g.logEvent({ tag: '经营', title: '批量车站商业开发：' + q.items.length + ' 座', desc: '投入约 ' + U.fmtMoney(q.cost) + '，开发等级「' + L.name + '」' });
    if (CM.Sound) CM.Sound.play('develop');
    this.markUnsaved(); this.scheduleAutosave();
    return { n: q.items.length };
  };
  // 批量装修：只改给出的项，其余保留各站原样；renov 同时按当前年代翻新。免费、不影响客流
  UI.prototype.applyBatchDecor = function (ids, patch, renov) {
    const g = this.g(), net = g.draft ? g.draft.net : g.net; let n = 0;
    Array.from(new Set(ids)).forEach(function (id) {
      const s = net.stations[id]; if (!s) return;
      const p = { decor: Object.assign({ style: 'auto', color: null, art: 'none', sign: 'std' }, s.decor || {}, patch) };
      if (renov) p.renov = g.clock.y;
      patchDisplay(g, 'stations', id, p); n++;
    });
    if (n) { if (CM.Sound) CM.Sound.play('decor'); this.R._smC = null; this.markUnsaved(); this.scheduleAutosave(); }
    return n;
  };
  UI.decorName = function (key, v) { const o = UI.DECOR[key].find(function (x) { return x[0] === v; }); return o ? o[1] : v; };
  UI.prototype.decorBody = function (id, after) {
    const g = this.g(), self = this, net = g.draft ? g.draft.net : g.net, s = net.stations[id]; if (!s) return h('div');
    const dc = Object.assign({ style: 'auto', color: null, art: 'none', sign: 'std' }, s.decor || {});
    const rg = g.city.regionAt(s.x, s.y), plan = rg && rg.plan;
    const rec = plan === 'oldmix' ? 'heritage' : (plan === 'cbd' || plan === 'newtown' ? 'modern' : (plan === 'campus' ? 'garden' : (plan === 'ind' || plan === 'resind' ? 'industrial' : null)));
    const set = function (patch) {
      const nd = Object.assign({}, dc, patch);
      if (CM.Sound) CM.Sound.play('decor');
      patchDisplay(g, 'stations', id, { decor: nd });
      self.R._smC = null; self.markUnsaved(); self.scheduleAutosave(); if (after) after();
    };
    // 预览：鼠标移到选项上时先看效果，点击才应用
    const lines = M.stationLines(net, id).map(function (l) { return net.lines[l]; }).filter(Boolean), artBox = h('div', { class: 'st-artbox', html: self.stationArt(s, lines) });
    const peek = function (patch) { artBox.innerHTML = self.stationArt(s, lines, patch); };
    const seg = function (key, opts) {
      const box = h('div', { class: 'seg-ctl sm dec-seg' });
      for (const o of opts) box.appendChild(h('button', { class: dc[key] === o[0] ? 'on' : '', 'data-silent': '1', onpointerenter: function () { peek({ [key]: o[0] }); }, onpointerleave: function () { peek(); }, onclick: function () { set({ [key]: o[0] }); } }, o[1], key === 'style' && o[0] === rec ? h('i', { class: 'dec-rec' }, CM.I18n && CM.I18n.get() === 'en' ? '★' : '荐') : null));
      return box;
    };
    const b = h('div', { class: 'dec' });
    b.appendChild(h('div', { class: 'st-arts one' }, h('figure', null, artBox)));
    b.appendChild(h('div', { class: 'note' }, '只改变车站外观，不收费、不影响客流。' + (rec ? '本站所在片区建议「' + UI.decorName('style', rec) + '」。' : '')));
    b.appendChild(h('div', { class: 'field' }, h('label', null, '建筑风格'), seg('style', UI.DECOR.style)));
    const sw = h('div', { class: 'dec-colors' }, h('button', { class: 'dec-sw line' + (!dc.color ? ' on' : ''), 'data-tip': '线路色', onclick: function () { set({ color: null }); } }, CM.I18n && CM.I18n.get() === 'en' ? 'L' : '线'));
    for (const c of UI.DECOR_COLORS) sw.appendChild(h('button', { class: 'dec-sw' + (dc.color === c ? ' on' : ''), style: { background: c }, 'aria-label': c, onclick: function () { set({ color: c }); } }));
    Array.prototype.forEach.call(sw.children, function (el, i) { const c = i ? UI.DECOR_COLORS[i - 1] : null; el.addEventListener('pointerenter', function () { peek({ color: c }); }); el.addEventListener('pointerleave', function () { peek(); }); });
    b.appendChild(h('div', { class: 'field' }, h('label', null, '主题色'), sw));
    b.appendChild(h('div', { class: 'field' }, h('label', null, '公共艺术'), seg('art', UI.DECOR.art)));
    b.appendChild(h('div', { class: 'field' }, h('label', null, '标识风格'), seg('sign', UI.DECOR.sign)));
    const st = g.net.stations[id], era = CM.Agents ? CM.Agents.eraOf(Math.max((st && st.built && st.built[0]) || g.clock.y, g.clock.y - 40, (st && st.renov) || 0)) : '', now = CM.Agents ? CM.Agents.eraOf(g.clock.y) : '';
    b.appendChild(h('div', { class: 'row', style: { gap: '6px', marginTop: '6px', flexWrap: 'wrap' } },
      h('button', { class: 'btn sm', disabled: dc.style === 'auto' && era === now ? true : null, 'data-tip': '外观改为随年代，并按当前年代翻新', onclick: function () { patchDisplay(g, 'stations', id, { renov: g.clock.y }); set({ style: 'auto' }); self.toast(s.name + ' 已按 ' + g.clock.y + ' 年的风格翻新', 'good'); } }, ic('sparkle', 14), '翻新为当代外观'),
      dc.style !== 'auto' || dc.color || dc.art !== 'none' || dc.sign !== 'std' ? h('button', { class: 'btn sm ghost', onclick: function () { set({ style: 'auto', color: null, art: 'none', sign: 'std' }); } }, '恢复默认') : null));
    return b;
  };
  UI.prototype.decorBlock = function (id) {
    const self = this, g = this.g(), s = (g.draft ? g.draft.net : g.net).stations[id], dc = (s && s.decor) || {};
    return this.sec('st-decor', '车站文化与装修', !dc.style || dc.style === 'auto' ? '随年代' : UI.decorName('style', dc.style), function () { return self.decorBody(id, function () { self.rerenderPage(); }); }, false, 'palette');
  };
  // ======================== 页面：车站 ========================
  // 控件每次都读取最新草案（草案变化后页面自动刷新）；已建状态与草案状态分别说明
  UI.prototype.page_station = function (id) {
    const g = this.g(), self = this;
    const net = g.draft ? g.draft.net : g.net;
    const s = net.stations[id];
    if (!s) return null;
    const el = h('div');
    const official = g.net.stations[id];
    // 车站形式；天地换乘车站列出各层站台（如「地下 + 高架」）
    const desc = function (x, n) { return CFG.metro.sizeName[x.size] + ' · ' + (x.lv ? M.levelsText(M.stationLevels(n, id)) : CFG.metro.typeName[x.type]); };
    const lines = M.stationLines(net, id).map(function (l) { return net.lines[l]; }).filter(Boolean);
    el.appendChild(h('div', { class: 'row', style: { flexWrap: 'wrap', marginBottom: '8px' } }, lines.length ? lines.map(function (l) { return h('span', { class: 'tag', style: { background: AX.line(l) + '22', color: AX.line(l) } }, '● ' + l.name); }) : h('span', { class: 'tag' }, '未接入线路'), lines.length > 1 ? h('span', { class: 'tag xfer' }, s.lv ? '⇄ 天地换乘' : '⇄ 换乘站') : null, h('span', { class: 'tag' }, desc(s, net)), !official ? h('span', { class: 'tag info' }, '草案中（未建成）') : null, h('span', { class: 'grow' }), this.favBtn('stations', id)));
    // 分页（v2.1 第二轮）：「概况」只看客流与服务，「建设」集中规模、站台、方向、绘线与拆除；名称点标题修改。草案中的新站只有建设页
    const tab = !official ? 'build' : ((this._tab && this._tab.station) || 'info');
    if (official) el.appendChild(this.pageTabs([['info', '概况', 'chart'], ['build', '建设', 'hammer']], tab, function (t) { self._tab = self._tab || {}; self._tab.station = t; self.renderPage(false); }));
    const changed = official && (official.size !== s.size || desc(official, g.net) !== desc(s, net) || U.dist(official.x, official.y, s.x, s.y) > 0.004);
    if (changed && tab === 'build') {
      const moved = U.dist(official.x, official.y, s.x, s.y) * CFG.CELL_M;
      el.appendChild(h('div', { class: 'draft-diff' }, h('span', { class: 'dd-k' }, '已建'), h('span', null, desc(official, g.net)), h('span', { class: 'dd-arrow' }, '→'), h('span', { class: 'dd-k draft' }, '草案'), h('span', null, desc(s, net) + (moved > 1 ? ' · 移动 ' + Math.round(moved) + ' m' : ''))));
    } else if (changed) el.appendChild(h('div', { class: 'callout info clickable', onclick: function () { self.openObj('station', id, 'build'); } }, '草案中有修改，确认建设后生效 · 查看'));
    const ret = { title: s.name + ' 站', el: el, highlightLine: null, titleEdit: { value: s.name, max: 16, apply: function (v) { return self.setStationName(id, v); } } };
    if (tab === 'build') { el.appendChild(this.stationBuild(id)); return ret; }
    const C = g.model.net ? g.model.net.C : null;
    const k = C && official ? C.sIndex.get(id) : undefined;
    const serviced = k !== undefined && !!C.serviced[k];
    if (serviced && (!g.model.stDaily || g.model.dailyStale)) {
      // 新网络刚投入运营：车站客流还按旧网络统计，算完后页面自动刷新（见 UI.tick）
      el.appendChild(h('div', { class: 'note' }, '客流数据计算中…（新网络投入运营后几秒内完成）'));
    } else if (serviced) {
      const sd = g.model.stDaily;
      const grid = h('div', { class: 'stat-grid' });
      const sIn = this.stat('日进站（周平均）', '—'), sOut = this.stat('日出站（周平均）', '—'), sX = this.stat('日换乘（周平均）', '—'), sP = this.stat('当前小时负荷', '—');
      grid.append(sIn, sOut, sX, sP);
      el.appendChild(grid);
      const cap = CFG.metro.stationCap[C.stations[k].size];
      this.live.push(function () {
        const d2 = g.model.stDaily, dw = g.model.stDailyWk, de = g.model.stDailyWe;   // 每次读取最新统计（模型收敛过程中会不断替换）
        if (!d2 || !dw || !de || g.model.dailyStale || g.model.net.C !== C || k >= d2.inn.length) return;
        const sub = function (a, b) { return '工作日 ' + U.fmtPeople(a) + ' · 周末 ' + U.fmtPeople(b); };
        sIn.setV(U.fmtPeople(d2.inn[k]) + ' 人次', sub(dw.inn[k], de.inn[k])); sOut.setV(U.fmtPeople(d2.out[k]) + ' 人次', sub(dw.out[k], de.out[k])); sX.setV(U.fmtPeople(d2.xfer[k]) + ' 人次', sub(dw.xfer[k], de.xfer[k]));
        const W = g.model.weights(g.clock.minute);
        const f = g.model.stFlowAt(k, W, 'stIn') + g.model.stFlowAt(k, W, 'stOut') + g.model.stFlowAt(k, W, 'stXfer');
        sP.setV(U.fmtPct(f / cap, 0), U.fmtInt(f) + ' / ' + U.fmtInt(cap) + ' 人次/时', f / cap > 1 ? 'bad' : (f / cap > 0.8 ? 'warn' : 'muted'));
      });
      const diag = this.crowdBlock(id, k);
      if (diag) el.appendChild(diag);
      el.appendChild(this.sec('st-xfer', '换乘关系', '', function () {
        const b = h('div');
        if (lines.length > 1) b.appendChild(h('div', { class: 'small' }, '站内换乘：' + lines.map(function (l) { return l.name; }).join('、')));
        const acc = g.model.net.acc;
        const xs = acc.transfers.filter(function (t) { return t.a === k; });
        if (xs.length) for (const t of xs) { const o = C.stations[t.b]; b.appendChild(h('div', { class: 'small clickable', style: { padding: '3px 4px' }, onclick: function () { self.select({ kind: 'station', id: o.id }); } }, '站外换乘：步行 ' + Math.round(t.m) + ' m（约 ' + Math.ceil(t.m / CFG.walk.mPerMin) + ' 分钟）至「' + o.name + '」')); }
        if (lines.length <= 1 && !xs.length) b.appendChild(h('div', { class: 'note' }, '暂无换乘。站外换乘需要两座运营车站之间存在 ' + CFG.walk.transferMaxM + ' m 以内的可步行道路。'));
        return b;
      }, true));
      el.appendChild(this.sec('st-cover', '步行覆盖', '', function () { return self.coverBlock(s, k, false); }));
      // 附近的重要设施（步行 15 分钟内可达本站的设施，v1.9）
      const mdl = g.model, accF = mdl.net.acc, facNear = [];
      if (mdl.fn && accF.NZ === mdl.fn.NZ) mdl.fn.list.forEach(function (f, q) { const zl = accF.zl[mdl.Z + q]; const e = zl && zl.find(function (x) { return x.s === k; }); if (e) facNear.push({ f: f, w: e.w }); });
      if (facNear.length) el.appendChild(this.sec('st-fac', '附近的重要设施', facNear.length + ' 处', function () {
        const b = h('div');
        facNear.sort(function (a, c) { return a.w - c.w; });
        for (const it of facNear) b.appendChild(h('div', { class: 'chg small clickable', onclick: function () { self.select({ kind: 'facility', id: it.f.id }); } }, h('span', null, ic(it.f.T.icon), ' ', it.f.name), h('span', { class: 'num' }, '步行约 ' + Math.max(1, Math.round(it.w)) + ' 分钟')));
        return b;
      }, true));
      el.appendChild(this.sec('st-ops', '运营与费用', '', function () {
        const oi = g.econ.opsIndex(g.clock.y);
        const pw = g.model.stDailyWk, pe = g.model.stDailyWe;
        return self.kv([['车站容量', U.fmtInt(cap) + ' 人次/小时'], ['日运营费用', U.fmtMoney(CFG.ops.stationDaily[C.stations[k].size] * oi)], ['建成时间', official.built ? official.built[0] + '年' + official.built[1] + '月' : '—'], ['高峰小时客流', pw && pe ? '工作日 ' + U.fmtInt(pw.peak[k]) + ' · 周末 ' + U.fmtInt(pe.peak[k]) + ' 人次' : U.fmtInt(sd.peak[k]) + ' 人次']]);
      }));
      el.appendChild(this.todBlock(id));
      el.appendChild(this.decorBlock(id));
    } else if (official && k !== undefined) {
      el.appendChild(this.callout('warn', 'warn', '该车站尚未接入运营线路，不提供服务：不计入地铁覆盖，也不产生客流和票款。把它连接到线路并确认建设后生效。'));
      el.appendChild(this.sec('st-cover', '潜在步行覆盖（接入线路后）', '', function () { return self.coverBlock(s, k, true); }));
    } else if (official) {
      el.appendChild(h('div', { class: 'note' }, '客流数据计算中…'));
    } else {
      el.appendChild(h('div', { class: 'callout info' }, '这是草案中的新车站，确认建设后立即投入运营并产生客流数据。'));
    }
    el.appendChild(h('div', { class: 'row', style: { marginTop: '8px' } }, h('button', { class: 'btn sm ghost', onclick: function () { self.flyTo(s.x, s.y, 30); } }, h('span', { html: ICON.loc.replace('<svg', '<svg width="14" height="14"') }), '定位')));
    return ret;
  };
  // 车站「建设」分页（v2.1 第二轮）：规模、车站形式与各线路站台层、站台方向、从此绘线、移动与拆除，全部进入草案
  UI.prototype.stationBuild = function (id) {
    const g = this.g(), self = this, net = g.draft ? g.draft.net : g.net, s = net.stations[id], official = g.net.stations[id];
    const latest = function () { return (g.draft ? g.draft.net : g.net).stations[id]; };
    const lines = M.stationLines(net, id).map(function (l) { return net.lines[l]; }).filter(Boolean);
    const b = h('div');
    b.appendChild(h('div', { class: 'field' }, h('label', null, '车站规模'), self.sizeCards({
      type: s.type, cur: s.size, base: official ? official.size : null, rebuild: !!official && official.type !== s.type,
      onPick: function (sz) { const c = latest(); if (c && c.size !== sz) g.edit(function (n) { n.stations[id].size = sz; }); },
    })));
    const tc = h('div', { class: 'seg-ctl' });
    for (const t of ['underground', 'surface', 'elevated']) tc.appendChild(h('button', { class: s.type === t ? 'on' : '', onclick: function () { const c = latest(); if (c && c.type !== t) g.edit(function (n) { n.stations[id].type = t; M.normalizeLevels(n); }); } }, CFG.metro.typeName[t], official && official.type === t && s.type !== t ? h('small', null, '（已建）') : null));
    b.appendChild(h('div', { class: 'field' }, h('label', null, (lines.length > 1 ? '主站台形式' : '车站形式') + (official ? '（改建按新建计费；选回已建形式即撤销改建）' : '')), tc));
    // 天地换乘：换乘站可为每条线路分别选择站台层（地下线与高架线同站换乘）
    if (lines.length > 1) {
      const box = h('div', { class: 'plat-levels' });
      const offLv = official ? M.stationLevels(g.net, id) : [];
      for (const l of lines) {
        const cur = M.platType(s, l.id), ctl = h('div', { class: 'seg-ctl' });
        for (const t of ['underground', 'surface', 'elevated']) ctl.appendChild(h('button', { class: cur === t ? 'on' : '', onclick: function () { const c = latest(); if (c && M.platType(c, l.id) !== t) g.edit(function (n) { M.setPlatform(n, id, l.id, t); }); } }, CFG.metro.typeName[t], cur !== t && offLv.indexOf(t) >= 0 ? h('small', null, '（已建）') : null));
        box.appendChild(h('div', { class: 'plat-row' }, h('span', { class: 'plat-line' }, h('span', { class: 'dot', style: { background: AX.line(l) } }), l.name), ctl));
      }
      b.appendChild(h('div', { class: 'field' }, h('label', null, '各线路站台层（天地换乘）'), box,
        h('div', { class: 'tiny muted' }, '每条线可用不同的站台层；新增一层按 ' + Math.round((CFG.metro.levelFactor || 0.6) * 100) + '% 车站造价计费。')));
    }
    // 站台方向（v2.1 玩家反馈）：每条线路的站台直线段朝向，草案中随时可调（含尚未确认建设的车站）；自动时随相邻轨道取顺直方向
    if (lines.length) {
      const box = h('div', { class: 'plat-levels' });
      const bearing = function (a) { const b = Math.round(((a * 180 / Math.PI) + 90) % 180); return b === 0 ? '南北向' : (b === 90 ? '东西向' : (b < 90 ? '北偏东 ' + b + '°' : '北偏西 ' + (180 - b) + '°')); };
      for (const l of lines) {
        const a = M.platformDir(net, id, l.id); if (a == null) continue;
        const set = !!(s.pd && s.pd[l.id] != null);
        const rot = function (d) { g.edit(function (n) { const a0 = M.platformDir(n, id, l.id); if (a0 != null) M.setPlatformDir(n, id, l.id, a0 + d * Math.PI / 180); }); };
        box.appendChild(h('div', { class: 'plat-row' }, h('span', { class: 'plat-line' }, h('span', { class: 'dot', style: { background: AX.line(l) } }), l.name),
          h('span', { class: 'tiny muted grow' }, (set ? '已设定 · ' : '自动 · ') + bearing(a)),
          h('button', { class: 'btn sm ghost', 'data-tip': '逆时针旋转 15°', 'aria-label': '逆时针旋转 15°', onclick: function () { rot(-15); } }, '↺'),
          h('button', { class: 'btn sm ghost', 'data-tip': '顺时针旋转 15°', 'aria-label': '顺时针旋转 15°', onclick: function () { rot(15); } }, '↻'),
          set ? h('button', { class: 'btn sm ghost', 'data-tip': '恢复自动方向', onclick: function () { g.edit(function (n) { M.setPlatformDir(n, id, l.id, null); }); } }, '自动') : null));
      }
      b.appendChild(h('div', { class: 'field' }, h('label', null, '站台方向'), box, h('div', { class: 'tiny muted' }, '也可在「修改」工具中拖动车站旁的旋转手柄。')));
    }
    // 绘线入口：端点站延长、中间站绘制支线
    const acts = h('div', { class: 'row', style: { flexWrap: 'wrap', gap: '6px' } });
    for (const l of lines) {
      const tp = M.lineTopo(net, l.id);
      if (tp.topo === 'loop' || tp.topo === 'invalid' || !tp.adj || !tp.adj.get(id)) continue;
      const deg = tp.adj.get(id).length;
      acts.appendChild(h('button', { class: 'btn sm', onclick: function () { self.startDraw(id, l.id, deg >= 2); } }, h('span', { class: 'dot', style: { background: AX.line(l) } }), deg >= 2 ? '绘制 ' + l.name + ' 支线' : '延长 ' + l.name));
    }
    acts.appendChild(h('button', { class: 'btn sm', onclick: function () { self.startDraw(id, 'new'); } }, '新建线路'));
    b.appendChild(h('div', { class: 'field' }, h('label', null, '从此站绘线'), acts));
    b.appendChild(h('div', { class: 'row', style: { marginTop: '8px' } },
      h('button', { class: 'btn sm', onclick: function () { self.tools.setTool('edit'); self.select({ kind: 'station', id: id }); } }, '移动车站'),
      h('span', { class: 'grow' }),
      h('button', { class: 'btn sm danger', onclick: function () { self.demolish({ kind: 'station', id: id }); } }, '拆除')));
    const imp = self.demolishImpact({ kind: 'station', id: id });
    if (imp && imp.lines.length) b.appendChild(h('div', { class: 'note', style: { marginTop: '6px' } }, '拆除影响：' + imp.lines.join('；')));
    b.appendChild(h('div', { class: 'note', style: { marginTop: '6px' } }, '所有修改先进入建设草案，确认后生效。'));
    return b;
  };
  // 步行覆盖（沿实际道路）；potential：未通车站接入线路后的潜在覆盖
  UI.prototype.coverBlock = function (s, k, potential) {
    const g = this.g(), acc = g.model.net.acc, tree = acc.trees[k];
    if (!tree) return h('div', { class: 'callout warn' }, '车站周边暂无可步行到达的道路，暂无覆盖。');
    const vm = new Map(); for (let q = 0; q < tree.verts.length; q++) vm.set(tree.verts[q], tree.dist[q]);
    const city = g.city, VW = city.VW, ci = Math.floor(s.x), cj = Math.floor(s.y);
    const sums = [0, 0, 0], jobs = [0, 0, 0];
    for (let j = Math.max(0, cj - 6); j <= Math.min(city.H - 1, cj + 6); j++) for (let i = Math.max(0, ci - 6); i <= Math.min(city.W - 1, ci + 6); i++) {
      const v0 = j * VW + i;
      let m = Infinity; for (const v of [v0, v0 + 1, v0 + VW, v0 + VW + 1]) { const dd = vm.get(v); if (dd !== undefined && dd < m) m = dd; }
      m += CFG.walk.cellExtraM;
      const c = j * city.W + i;
      for (let q = 0; q < 3; q++) if (m <= (q + 1) * 5 * CFG.walk.mPerMin) { sums[q] += city.pop[c]; jobs[q] += city.jobs[c]; }
    }
    return h('div', null, this.kv([['步行 5 分钟内', U.fmtPeople(sums[0]) + ' 人 · ' + U.fmtPeople(jobs[0]) + ' 岗位'], ['步行 10 分钟内', U.fmtPeople(sums[1]) + ' 人 · ' + U.fmtPeople(jobs[1]) + ' 岗位'], ['步行 15 分钟内', U.fmtPeople(sums[2]) + ' 人 · ' + U.fmtPeople(jobs[2]) + ' 岗位']]),
      h('div', { class: 'note', style: { marginTop: '6px' } }, (potential ? '预览：通车前不计入覆盖。' : '') + '按实际道路步行计算，河流与地面铁路会阻隔。'));
  };
  // 线路早高峰各区段的满载率（v2.8 玩家反馈：任务里的数字查不到来源）：任务、地铁芯和线路详情共用 Tasks.crowdSections，从高到低列出，点一行定位到区段
  UI.prototype.crowdTable = function (lid, max) {
    const g = this.g(), self = this, model = g.model, all = CM.Tasks.crowdSections(g, lid);
    if (!all.length) return h('div', { class: 'small muted' }, '客流计算中…');
    const on = all.filter(function (s) { return !s.noTrain; });
    if (!on.length) return h('div', null, h('div', { class: 'small bad' }, '早高峰没有列车运行：列车都调走了，或手动把早高峰的列车设成了 0。配属列车后才有满载率。'), g.fleet ? h('button', { class: 'btn sm', style: { marginTop: '6px' }, onclick: function () { self.openObj('line', lid, 'ops'); } }, CM.icon('train', 14), '列车运营') : null);
    const C = model.net.C, multi = new Set(on.map(function (s) { return s.r; })).size > 1;
    const tbl = h('table', { class: 'tbl' }, h('tr', null, h('th', null, '区段'), h('th', null, '断面客流'), h('th', null, '运力'), h('th', null, '满载率')));
    for (const s of on.sort(function (x, y) { return y.lf - x.lf; }).slice(0, max || 8)) {
      const A = C.stations[s.rev ? s.b : s.a], B = C.stations[s.rev ? s.a : s.b], rt = C.routes[s.r], ref = rt.segRefs[s.leg];
      tbl.appendChild(h('tr', { class: 'clickable', onclick: function () { const locate = function () { self.flyTo((A.x + B.x) / 2, (A.y + B.y) / 2, Math.max(self.R.cam.zoom, 20)); if (ref) self.select({ kind: 'seg', id: ref.id }); }; if (self.opsApp) self.opsApp.close(locate); else locate(); } },
        h('td', null, A.name + ' → ' + B.name + (multi ? '（' + rt.label + '）' : '')), h('td', null, U.fmtInt(s.load)), h('td', null, U.fmtInt(s.capH)), h('td', { class: s.lf > 1 ? 'bad' : '' }, U.fmtPct(s.lf, 0))));
    }
    return h('div', { class: 'crowd-table' }, tbl, h('div', { class: 'tiny muted', style: { marginTop: '4px' } }, '工作日早高峰，单位人/时；满载率 = 断面客流 ÷ 运力（发车频率 × 列车定员）。'));
  };
  // 拥挤诊断：区分车站容量不足与列车运力不足，给出对应的处理入口
  UI.prototype.crowdBlock = function (id, k) {
    const g = this.g(), self = this, model = g.model, mnet = model.net, C = mnet.C, sd = model.dailyStale ? null : (model.stDailyWk || model.stDaily), mc = CFG.metro;
    if (!sd || k >= sd.peak.length) return null;
    const st = C.stations[k], cap = mc.stationCap[st.size], stR = sd.peak[k] / cap;
    const ord = M.sizeList(g.clock.y, st.size), next = function (sz) { return ord[Math.min(ord.length - 1, ord.indexOf(sz) + 1)]; }, topSize = ord[ord.length - 1];
    const trains = [];
    for (const r of C.stationRoutes[k]) {
      const rt = C.routes[r], re = mnet.rideEdge[r], n = rt.stIdx.length;
      let worst = null;
      for (const p of [0, 2]) {
        const P = model.ctxs.wd.per[p], capT = model.capOf(r, mnet);   // 工作日早晚高峰；定员按车队（v2.5）
        for (let q = 0; q < re.length; q++) {
          const leg = q >> 1, a = rt.stIdx[leg], b = rt.stIdx[(leg + 1) % n], capH = CM.Model.dirFreq(P, mnet, r, q) * capT;
          if ((a !== k && b !== k) || !(capH > 0)) continue;
          const lf = P.load[re[q]] / capH;
          if (!worst || lf > worst.lf) worst = { lf: lf, load: P.load[re[q]], capH: capH, leg: leg, a: a, b: b, p: p, freq: P.freq[r] };
        }
      }
      if (worst && worst.lf > 1) trains.push({ rt: rt, w: worst });
    }
    if (stR <= 0.8 && !trains.length) return null;
    const box = h('div', { class: 'diag' }, h('div', { class: 'diag-h' }, CM.icon('warn'), '拥挤诊断'));
    const item = function (level, title, text, actions) { box.appendChild(h('div', { class: 'diag-item lv-' + level }, h('b', null, title), h('div', { class: 'small' }, text), actions.filter(Boolean).length ? h('div', { class: 'row', style: { flexWrap: 'wrap', gap: '6px', marginTop: '6px' } }, actions.filter(Boolean)) : null)); };
    const divert = h('button', { class: 'btn sm ghost', onclick: function () { self.showDiversion(st); } }, '查看可分流方向');
    if (stR > 0.8) {
      const up = st.size !== topSize ? h('button', { class: 'btn sm primary', onclick: function () { g.edit(function (n) { if (n.stations[id]) n.stations[id].size = next(st.size); }); self.toast('已在草案中把「' + st.name + '」升级为' + mc.sizeName[next(st.size)] + '车站', 'info'); } }, '升级为' + mc.sizeName[next(st.size)] + '车站') : null;
      item(stR > 1 ? 'bad' : 'warn', stR > 1 ? '车站容量不足' : '车站接近饱和', '工作日高峰小时进出站与换乘约 ' + U.fmtInt(sd.peak[k]) + ' 人次，' + mc.sizeName[st.size] + '车站能力 ' + U.fmtInt(cap) + ' 人次/时（' + U.fmtPct(stR, 0) + '）。' + (stR > 1 ? '乘客在闸机、楼梯与换乘通道排队，进出站变慢。' : '') + (st.size === 'XL' ? '已是超大型车站，只能通过新线路分流。' : st.size === topSize ? (isFinite(M.xlYear()) ? '已是大型车站：' + M.xlYear() + ' 年起可升级为超大型，现在只能通过新线路分流。' : '已是大型车站，只能通过新线路分流。') : ''), [up, divert]);
    }
    for (const t of trains) {
      const rt = t.rt, w = t.w, A = C.stations[w.a], B = C.stations[w.b];
      const minCars = rt.cars, limiting = rt.stIds.filter(function (sid) { return mc.carsBySize[C.stations[C.sIndex.get(sid)].size] === minCars; });
      const atMax = w.freq >= mc.fMax - 0.5;
      const helpsHere = limiting.indexOf(id) >= 0;
      const segRef = rt.segRefs[w.leg];
      const locate = h('button', { class: 'btn sm', onclick: function () { self.flyTo((A.x + B.x) / 2, (A.y + B.y) / 2, Math.max(self.R.cam.zoom, 20)); if (segRef) self.select({ kind: 'seg', id: segRef.id }); } }, '定位瓶颈区间');
      const lengthen = minCars < 8 ? h('button', { class: 'btn sm primary', onclick: function () {
        g.edit(function (n) { for (const sid of limiting) if (n.stations[sid]) n.stations[sid].size = next(n.stations[sid].size); });
        self.toast('已在草案中升级 ' + limiting.length + ' 座车站，' + rt.line.name + ' 可加长到 ' + mc.carsBySize[next(C.stations[C.sIndex.get(limiting[0])].size)] + ' 节编组', 'info');
      } }, '加长编组：升级 ' + limiting.length + ' 座' + mc.sizeName[C.stations[C.sIndex.get(limiting[0])].size] + '车站') : null;
      item('bad', '列车运力不足 · ' + rt.label, A.name + '—' + B.name + ' 区间工作日' + (w.p === 0 ? '早' : '晚') + '高峰断面约 ' + U.fmtInt(w.load) + ' 人/时，超过运力 ' + U.fmtInt(w.capH) + ' 人/时（' + U.fmtNum(w.freq, 1) + ' 列/时' + (atMax ? '，已达发车上限' : '') + '，' + minCars + ' 节编组）。' +
        (minCars < 8 ? '编组受沿线最小车站限制，' + (helpsHere ? '本站是限制编组的车站之一，需与其余 ' + (limiting.length - 1) + ' 座同时升级。' : '只升级本站不能解决，需要升级限制编组的车站。') : '已是最长编组，只能修建平行线路分流。'), [locate, lengthen, divert]);
    }
    return box;
  };
  // 可分流方向：打开出行方向图层（只看地铁）并定位到车站
  UI.prototype.showDiversion = function (st) {
    this.R.layerOpt.flow = 'metro';
    this.setLayer('flow');
    this.flyTo(st.x, st.y, Math.min(this.R.cam.zoom, 16));
    this.toast('出行方向图层：经过「' + st.name + '」一带的粗蓝色流向，是修建平行线路分流的候选方向', 'info');
  };
  // 从车站开始绘线：延长线路、绘制支线或新建线路
  UI.prototype.startDraw = function (sid, lid, branch) {
    const g = this.g(), T = this.tools, net = g.draft ? g.draft.net : g.net, s = net.stations[sid];
    if (!s) return;
    T.setTool('line');
    T.lineChoice = lid; T.chain = sid; T.bends = [];
    T.lineLock = true;
    this.renderToolOpts();
    const ln = lid !== 'new' ? net.lines[lid] : null;
    this.toast(ln ? (branch ? '从「' + s.name + '」绘制 ' + ln.name + ' 支线' : '从「' + s.name + '」延长 ' + ln.name) + '：点击车站或空地连线，右键结束' : '从「' + s.name + '」开始新建线路：点击车站或空地连线', 'info');
  };

  // ======================== 页面：线路 ========================
  UI.prototype.page_line = function (key) {
    const g = this.g(), self = this;
    const parts = String(key).split('|'), lid = parts[0], segId = parts[1];
    const net = g.draft ? g.draft.net : g.net;
    const line = net.lines[lid];
    if (!line) return null;
    const el = h('div');
    const tp = M.lineTopo(net, lid);
    const segs = M.lineSegs(net, lid);
    let len = 0; for (const s of segs) len += M.segGeom(net, s, g.city).lenM;
    el.appendChild(h('div', { class: 'row', style: { marginBottom: '8px', flexWrap: 'wrap' } }, h('span', { class: 'swatch', style: { background: AX.line(line), width: '22px', height: '8px' } }), h('span', { class: 'tag' }, M.TOPO_NAME[tp.topo]), h('span', { class: 'tag', 'data-tip': '运行速度：最小转弯半径 ' + M.minRadius(line) + ' m' }, M.lineKmh(line) + ' km/h'), h('span', { class: 'tag' }, U.fmtKm(len)), h('span', { class: 'tag' }, tp.stations.length + ' 站'), !g.net.lines[lid] ? h('span', { class: 'tag info' }, '草案中') : null, h('span', { class: 'grow' }), this.favBtn('lines', lid)));
    // 分页（v2.1 第二轮）：「概况」看客流、运营与车站，「编辑」集中颜色、贯通与拆开、区段与拆除；名称点标题修改，颜色也可点标题前的彩色徽标
    let tab = !g.net.lines[lid] ? 'build' : ((this._tab && this._tab.line) || 'info');
    if (tab === 'ops' && !(g.fleet && CM.Fleet)) tab = 'info';
    // 列车运营（v2.5）：车队、各交路分时段投入的列车、智能调度 / 手动
    if (g.net.lines[lid]) el.appendChild(this.pageTabs([['info', '概况', 'chart']].concat(g.fleet && CM.Fleet ? [['ops', '列车运营', 'train']] : [], [['build', '编辑', 'pencil']]), tab, function (t) { self._tab = self._tab || {}; self._tab.line = t; self.renderPage(false); }));
    if (tp.topo === 'invalid') el.appendChild(h('div', { class: 'callout bad' }, tp.reason));
    if (tab === 'ops') { this.lineOpsTab(el, lid); return { title: line.name, el: el, highlightLine: lid, titleEdit: { value: line.name, max: 14, apply: function (v) { self.setLineLook(lid, { name: v }); } }, badgeClick: function (e) { if (CM.Quick) CM.Quick.popColor(lid, e.currentTarget); }, badgeTip: '改颜色' }; }
    if (tab === 'info') {
      // 运营
      const mnet = g.model.net;
      const routes = mnet ? mnet.C.routes.map(function (r, i) { return [r, i]; }).filter(function (a) { return a[0].lineId === lid; }) : [];
      if (routes.length && g.net.lines[lid]) {
        const W = function () { return g.model.weights(g.clock.minute); };
        const daily = g.model.dailyStale ? null : g.model.stDaily;
        let board = 0; if (daily) for (const r of routes) board += daily.routeBoard[r[1]];
        const grid = h('div', { class: 'stat-grid' });
        let bw = 0, be = 0; if (daily && g.model.stDailyWk && g.model.stDailyWe) for (const r of routes) { bw += g.model.stDailyWk.routeBoard[r[1]]; be += g.model.stDailyWe.routeBoard[r[1]]; }
        grid.append(this.stat('日客运量（上车，周平均）', daily ? U.fmtPeople(board) + ' 人次' : '计算中…', daily ? '工作日 ' + U.fmtPeople(bw) + ' · 周末 ' + U.fmtPeople(be) : ''));
        const oi = g.econ.opsIndex(g.clock.y);
        // 车厢公里：两个方向的频率 × 线路长度 × 编组（v2.5 按车队的平均编组与车型成本系数）
        let ckm = 0, ckw = 0; const plan = g.model.fleetOf(mnet);
        for (const r of routes) for (let p = 0; p < 4; p++) {
          const P = g.model.live.per[p], fp = plan && plan[r[1]], fd = P.freqDir && P.freqDir.length === 2 * mnet.R ? P.freqDir[2 * r[1]] + P.freqDir[2 * r[1] + 1] : 2 * P.freq[r[1]];
          const v = fd * r[0].lenM / 1000 * (fp ? fp.cars : r[0].cars) * (p === 3 ? 5 : g.model.pHours[p]); ckm += v; ckw += v * (fp ? fp.opsF : 1);
        }
        grid.append(this.stat('日运营费用（' + (g.model.dayType === 'we' ? '周末' : '工作日') + '）', U.fmtMoney(ckw * CFG.ops.carKmCost * oi), '列车 ' + U.fmtInt(ckm) + ' 车厢公里'));
        el.appendChild(grid);
        el.appendChild(this.sec('ln-crowd', '早高峰各区段满载率', '', function () { return self.crowdTable(lid, 12); }, false, 'people'));
        for (const it of routes) {
          const r = it[0], ri = it[1];
          el.appendChild(this.sec('ln-r-' + r.label, r.label, '', function () {
            const b = h('div');
            const rows = h('div');
            const upd = function () {
              const w = W(); const f = g.model.freqAt(ri, w);
              const re = mnet.rideEdge[ri];
              let mx = 0; for (let q = 0; q < re.length; q++) mx = Math.max(mx, g.model.edgeLoadAt(re[q], w));
              const capT = g.model.capOf(ri, mnet), capH = f * capT, fp = (g.model.fleetOf(mnet) || [])[ri];
              // 配车：全日各时段所需列车的最大值，以及本时段的依据（站数、站距、客流）；有车队时为配属列车数（v2.5）
              let fleet = 0; for (let p = 0; p < 4; p++) fleet = Math.max(fleet, Math.ceil(r.cycleSec * g.model.live.per[p].freq[ri] / 3600));
              const ns = r.stIdx.length, sp = r.lenM / 1000 / Math.max(1, r.loop ? ns : ns - 1);
              const floor = CM.Model.serviceFloor(r, w.p0), byLoad = mx / (capT * CFG.metro.targetLF);
              rows.innerHTML = '';
              rows.appendChild(self.kv([
                ['当前发车', f > 0 ? U.fmtNum(f, 1) + ' 列/小时（间隔 ' + U.fmtNum(60 / f, 1) + ' 分钟）' : '停运（06:00–24:00 运营）'],
                ['运行列车', f > 0 ? Math.ceil(r.cycleSec / (3600 / f)) * (r.loop ? 2 : 1) + ' 列（周转 ' + Math.round(r.cycleSec / 60) + ' 分钟）' : '—'],
                ['配属列车', fp ? (fp.avail[0] + (r.loop ? fp.avail[1] : 0)) + ' 列（车队，见「列车运营」）' : fleet + ' 列（全日各时段所需的最大值）'],
                ['配车依据', ns + ' 站 · 平均站距 ' + U.fmtNum(sp, 1) + ' km → 最低 ' + U.fmtNum(floor, 1) + ' 列/时；客流需要 ' + U.fmtNum(byLoad, 1) + ' 列/时' + (byLoad > floor ? '（按客流）' : '（按服务水平）')],
                ['列车编组', fp && (fp.avail[0] || fp.avail[1]) ? '平均 ' + U.fmtNum(fp.cars, 1) + ' 节（最长 ' + r.cars + ' 节，受沿线最小车站限制），每列定员约 ' + U.fmtInt(capT) + ' 人' : r.cars + ' 节（受沿线最小车站限制），定员 ' + U.fmtInt(r.cap) + ' 人'],
                ['单向运力', f > 0 ? U.fmtInt(capH) + ' 人/小时' : '—'],
                ['最大断面客流', U.fmtInt(mx) + ' 人/小时', capH > 0 && mx > capH ? 'bad' : ''],
                ['满载率', capH > 0 ? U.fmtPct(mx / capH, 0) : '—', capH > 0 && mx > capH ? 'bad' : ''],
              ]));
            };
            upd(); self.live.push(upd);
            b.appendChild(rows);
            b.appendChild(h('div', { class: 'small muted', style: { margin: '8px 0 2px' } }, '当前小时各区间断面客流（上行/下行）'));
            const chart = h('div');
            const drawChart = function () { chart.innerHTML = ''; chart.appendChild(self.loadChart(r, ri, W())); };
            drawChart(); self.live.push(function () { if (Math.random() < 0.25) drawChart(); });
            b.appendChild(chart);
            b.appendChild(h('div', { class: 'note', style: { marginTop: '6px' } }, g.fleet ? '投入的列车数决定发车频率（最小间隔 2 分钟）：在「列车运营」分页购买、调配列车或改为手动设定；满载时也可以升级车站、换长编组列车，或修平行线分流。' : '列车按客流自动调配（最小间隔 2 分钟）；满载时升级车站加长编组，或修平行线分流。'));
            return b;
          }, routes.length === 1));
        }
      } else if (!g.net.lines[lid]) {
        el.appendChild(h('div', { class: 'callout info' }, '这是草案中的新线路，确认建设后立即投入运营。'));
      }
      // 车站列表
      el.appendChild(this.sec('ln-st', '车站', tp.stations.length + ' 座', function () {
        const b = h('div');
        const order = tp.routes.length ? tp.routes[0].st.concat(tp.routes.slice(1).map(function (r) { return r.st.filter(function (s) { return tp.routes[0].st.indexOf(s) < 0; }); }).flat()) : tp.stations;
        for (const sid of order) { const s = net.stations[sid]; if (!s) continue; b.appendChild(h('div', { class: 'small clickable', style: { padding: '4px' }, onclick: function () { self.select({ kind: 'station', id: sid }); } }, '● ' + s.name + '  ', h('span', { class: 'faint' }, CFG.metro.sizeName[s.size]))); }
        return b;
      }));
      // 共线运营：与其他线路共用的轨道区间，以及早高峰两线合计的发车密度
      const coRows = [];
      for (const sg of segs) {
        const co = M.coTrackSegs(net, sg); if (!co.length) continue;
        const ids = [sg.id].concat(co.map(function (c) { return c.id; }));
        let f = 0; const P = g.model.ctxs && g.model.ctxs.wd && g.model.ctxs.wd.per[0], MC = g.model.net && g.model.net.C;
        if (P && MC && net === g.net) MC.routes.forEach(function (r, ri) { if (r.legSegs.some(function (refs) { return refs.some(function (ref) { return ids.indexOf(ref.id) >= 0; }); })) f += P.freq[ri] || 0; });
        coRows.push({ sg: sg, lines: co.map(function (c) { return net.lines[net.segments[c.id].line]; }).filter(Boolean), f: f });
      }
      if (coRows.length) el.appendChild(this.sec('ln-co', '共线运营', coRows.length + ' 个区间', function () {
        const b = h('div');
        for (const c of coRows) {
          const over = c.f > CFG.metro.fMax + 0.5;
          b.appendChild(h('div', { class: 'chg small clickable', onclick: function () { self.select({ kind: 'seg', id: c.sg.id }); } },
            h('span', null, net.stations[c.sg.a].name + '—' + net.stations[c.sg.b].name + ' · 与 ' + c.lines.map(function (l) { return l.name; }).join('、') + ' 共用轨道'),
            c.f > 0 ? h('span', { class: 'num' + (over ? ' bad' : '') }, '早高峰合计 ' + U.fmtNum(c.f, 1) + ' 列/时') : null));
          if (over) b.appendChild(h('div', { class: 'tiny bad' }, '共线区段列车过密（上限 ' + CFG.metro.fMax + ' 列/时）：客流大时可把其中一条线改走独立轨道（绘线时加转弯点）或升级车站加长编组。'));
        }
        b.appendChild(h('div', { class: 'note', style: { marginTop: '6px' } }, '共线区段是同一条轨道，只建一次、只收一次费用，两条线路的列车都在这里运行和停靠；在共线轨道上插站时，共用这段轨道的线路一起停靠；调整转弯点或建设方式时，共用的线路同步改变。'));
        return b;
      }, true));
    }
    if (tab === 'build') {
      if (!g.net.lines[lid] && g.fleet && CM.Fleet) el.appendChild(this.lineSpeedBlock(lid));   // 草案中的新线路：运行速度在这里设定（运营中的线路在「列车运营」分页）
      // 贯通运营、支线命名与支线转为独立线路（v2.1 玩家反馈）：只改变运营组织，不改动轨道、不另收建设费
      const others = Object.keys(net.lines).filter(function (o) { return o !== lid && M.sharedStations(net, lid, o).length; });
      const mids = (tp.topo === 'path' || tp.topo === 'branch') ? tp.stations.filter(function (sid) { return tp.adj.get(sid).length >= 2; }) : [];
      if (tp.topo === 'branch' || others.length || mids.length) el.appendChild(this.sec('ln-through', '贯通、拆开与支线', tp.topo === 'branch' ? (tp.leaves.length - 1) + ' 条支线' : (others.length ? others.length + ' 条可贯通' : ''), function () {
        const b = h('div');
        if (tp.topo === 'branch') {
          // 起点端（主干）与主线方向（v2.3 玩家反馈：Y 字支线只能默认起点）：进入草案，确认后生效，不收费
          b.appendChild(h('div', { class: 'small muted', style: { margin: '2px 0 6px' } }, '各方向（从「' + net.stations[tp.root].name + '」出发' + (tp.main ? '，主线往「' + net.stations[tp.main].name + '」' : '') + '）'));
          const setDir = function (patch, msg) {
            const r = g.edit(function (n) { const L = n.lines[lid]; if (!L) return { error: '线路不存在' }; Object.assign(L, patch); if (L.main && L.main === L.root) delete L.main; });
            if (r.error) self.toast(r.error, 'bad'); else self.toast(msg + '，确认建设后生效（不收费）', 'info');
          };
          for (const leaf of tp.leaves) {
            const st = net.stations[leaf], isRoot = leaf === tp.root, isMain = leaf === tp.main;
            const row = h('div', { class: 'branch-row' }, h('span', { class: 'grow' }, (isRoot ? '起点端 · ' : (isMain ? '主线 · 往 ' : '往 ')) + st.name));
            if (!isRoot) row.appendChild(h('button', { class: 'btn sm' + (isMain ? ' on' : ''), 'data-tip': isMain ? '这个方向是主线（显示为线路本名，线路图与列表排在最前）；再点一次取消' : '把这个方向设为主线：显示为线路本名，其他方向为支线', onclick: function () { setDir({ main: isMain ? null : leaf }, isMain ? '已取消主线方向' : '已把往「' + st.name + '」设为主线'); } }, isMain ? '主线 ✓' : '设为主线'));
            if (!isRoot) row.appendChild(h('button', { class: 'btn sm ghost', 'data-tip': '让列车从「' + st.name + '」发车：这里到分岔站的一段成为各方向共用的主干', onclick: function () { setDir({ root: leaf, rootSet: true }, '已把「' + st.name + '」设为起点端'); } }, '设为起点端'));
            if (!isRoot) {
              const cur = (line.branchNames && line.branchNames[leaf]) || '';
              const nameIn = h('input', { type: 'text', value: cur, maxlength: 10, placeholder: '支线名称（可选）', 'aria-label': '支线名称' });
              const save = function () {
                const v = nameIn.value.trim(), L = (g.draft ? g.draft.net : g.net).lines[lid]; if (!L) return;
                const bn = Object.assign({}, L.branchNames || {}); if (v) bn[leaf] = v; else delete bn[leaf];
                self.setLineLook(lid, { branchNames: bn }); self.toast(v ? '支线已命名为「' + line.name + ' ' + v + '」' : '已恢复按终点站显示支线方向', 'good');
              };
              nameIn.addEventListener('keydown', function (e) { if (e.isComposing || e.keyCode === 229) return; if (e.key === 'Enter') { e.preventDefault(); save(); } });
              nameIn.addEventListener('change', save);
              row.appendChild(nameIn);
            }
            row.appendChild(h('button', { class: 'btn sm', 'data-tip': '把从「' + st.name + '」到分岔站的这一段改为一条独立线路，在分岔站与本线换乘', onclick: function () {
              const r = g.edit(function (n) { return M.detachBranch(n, lid, leaf); });
              if (r.error) self.toast(r.error, 'bad');
              else { const n2 = g.draft.net; self.toast('已在草案中拆出 ' + n2.lines[r.line].name + '（' + n2.stations[r.junction].name + '—' + st.name + '），确认建设后生效；可在其详情中改名、改色', 'info'); self.openPage('line', r.line, { replaceTop: true }); }
            } }, '转为独立线路'));
            b.appendChild(row);
          }
        }
        if (others.length) {
          b.appendChild(h('div', { class: 'small muted', style: { margin: '10px 0 6px' } }, '与其他线路贯通（把对方并入本线，保留本线名称与颜色）'));
          for (const o of others) {
            const L2 = net.lines[o], sh = M.sharedStations(net, lid, o).map(function (sid) { return net.stations[sid].name; });
            const trial = M.mergeLines(M.clone(net), lid, o);
            const what = trial.error ? trial.error : '合并后为' + M.TOPO_NAME[trial.topo] + (trial.notes.length ? '；' + trial.notes.join('；') : '');
            b.appendChild(h('div', { class: 'branch-row' }, h('span', { class: 'swatch', style: { background: AX.line(L2) } }),
              h('span', { class: 'grow' }, h('div', null, L2.name + ' · 在「' + sh.slice(0, 2).join('」「') + '」' + (sh.length > 2 ? '等 ' + sh.length + ' 站' : '') + '相接'), h('div', { class: 'tiny ' + (trial.error ? 'bad' : 'muted') }, what)),
              h('button', { class: 'btn sm', disabled: trial.error ? true : null, onclick: function () {
                const r = g.edit(function (n) { return M.mergeLines(n, lid, o); });
                if (r.error) self.toast(r.error, 'bad');
                else self.toast('已在草案中把 ' + r.other + ' 并入 ' + r.name + '（贯通运营，' + M.TOPO_NAME[r.topo] + '），确认建设后生效', 'info');
              } }, '贯通')));
          }
        }
        // 并线运行（v2.3 玩家反馈）：从本线的端点站起，沿另一条线的既有轨道继续延伸（共线运营，免建设费）
        const ends = (tp.leaves || []).filter(function (sid) { return M.stationLines(net, sid).some(function (o) { return o !== lid; }); });
        if (ends.length) {
          b.appendChild(h('div', { class: 'small muted', style: { margin: '10px 0 6px' } }, '并线运行：从本线端点沿其他线路的轨道继续开（共用轨道，不另收建设费）'));
          for (const sid of ends) for (const o of M.stationLines(net, sid)) {
            if (o === lid) continue;
            const L2 = net.lines[o], tp2 = M.lineTopo(net, o), mine = new Set(tp.stations);
            const opts = (tp2.stations || []).filter(function (x) { return !mine.has(x); });
            if (!L2 || !opts.length) continue;
            const sel = CM.UI.dropdown({ label: '并线终点站', items: opts.map(function (x) { return [x, net.stations[x].name]; }) });
            b.appendChild(h('div', { class: 'branch-row' }, h('span', { class: 'swatch', style: { background: AX.line(L2) } }), h('span', { class: 'grow small' }, '从「' + net.stations[sid].name + '」沿 ' + L2.name + ' 到'), sel,
              h('button', { class: 'btn sm', onclick: function () {
                const r = g.edit(function (n) { return M.runAlong(n, lid, sid, o, sel.value); });
                if (r.error) self.toast(r.error, 'bad'); else self.toast('已在草案中让 ' + line.name + ' 沿 ' + L2.name + ' 并线到「' + net.stations[sel.value].name + '」（' + r.added + ' 段共用轨道，沿途车站两线都停靠），确认建设后生效', 'info');
              } }, ic('merge', 14), '并线')));
          }
        }
        // 在中间站拆开（v2.1 第二轮）：拆开后各段在该站换乘，可再贯通合并回去
        if (mids.length) {
          const sel = CM.UI.dropdown({ label: '拆开的车站', cls: 'grow', items: tp.stations.filter(function (sid) { return mids.indexOf(sid) >= 0; }).map(function (sid) { return [sid, net.stations[sid].name]; }) });
          b.appendChild(h('div', { class: 'small muted', style: { margin: '10px 0 6px' } }, '在车站拆开成两条线'));
          b.appendChild(h('div', { class: 'row' }, sel, h('button', { class: 'btn sm', onclick: function () {
            const r = g.edit(function (n) { return M.splitLineAt(n, lid, sel.value); });
            if (r.error) self.toast(r.error, 'bad'); else self.toast('已在「' + net.stations[sel.value].name + '」拆开 ' + line.name + '，确认建设后生效', 'info');
          } }, ic('scissors', 14), '拆开')));
        }
        b.appendChild(h('div', { class: 'note', style: { marginTop: '8px' } }, '这些操作只改运营组织，不收费（共线区段两线合计最多 ' + CFG.metro.fMax + ' 列/时）。都进入草案，确认后生效。'));
        return b;
      }, tp.topo === 'branch'));
      // 选中区段
      const seg = segId ? net.segments[segId] : null;
      if (seg) {
        const geo = M.segGeom(net, seg, g.city);
        el.appendChild(this.sec('ln-seg', '选中区段：' + net.stations[seg.a].name + '—' + net.stations[seg.b].name, '', function () {
          const b = h('div');
          b.appendChild(self.kv([['长度', U.fmtKm(geo.lenM)], ['建设方式', CFG.metro.typeName[seg.type]], geo.waterM > 1 ? ['跨江', (seg.type === 'underground' ? '越江隧道 ' : '跨江桥梁 ') + U.fmtKm(geo.waterM)] : null, geo.hillM > 1 ? ['山体隧道', U.fmtKm(geo.hillM)] : null, ['最小曲线半径', isFinite(geo.minRadiusM) ? Math.round(geo.minRadiusM) + ' m' : '直线']]));
          const tc = h('div', { class: 'seg-ctl', style: { marginTop: '8px' } });
          for (const t of ['underground', 'surface', 'elevated']) {
            const cost = M.trackCost(geo, t, g.clock.y);
            tc.appendChild(h('button', { class: seg.type === t ? 'on' : '', 'data-tip': '约 ' + U.fmtMoney(cost), onclick: function () { const c = (g.draft ? g.draft.net : g.net).segments[segId]; if (c && c.type !== t) g.edit(function (n) { const s = n.segments[segId], co = M.coTrackSegs(n, s); s.type = t; M.syncCoTrack(n, s, co); }); } }, CFG.metro.typeName[t]));
          }
          b.appendChild(h('div', { class: 'field' }, h('label', null, '改变建设方式（按新建计费；跨江：地下=隧道，地面/高架=桥梁）'), tc));
          // 线形（v2.1）：平滑曲线（转弯点为控制柄）或穿过转弯点；长度变化按线形调整规则计费
          const cc = h('div', { class: 'seg-ctl', style: { marginTop: '8px' } });
          for (const cv of [['smooth', '平滑曲线'], ['pass', '穿过转弯点']]) cc.appendChild(h('button', { class: !!seg.curve === (cv[0] === 'smooth') ? 'on' : '', onclick: function () { const c = (g.draft ? g.draft.net : g.net).segments[segId]; if (c && !!c.curve !== (cv[0] === 'smooth')) g.edit(function (n) { const s2 = n.segments[segId], co = M.coTrackSegs(n, s2); if (cv[0] === 'smooth') s2.curve = 'arc'; else delete s2.curve; M.syncCoTrack(n, s2, co); }); } }, cv[1]));
          b.appendChild(h('div', { class: 'field' }, h('label', null, '线形（平滑曲线把转弯点当作控制柄；长度变化按线形调整规则计费）'), cc));
          b.appendChild(h('div', { class: 'row', style: { marginTop: '6px' } },
            h('button', { class: 'btn sm', onclick: function () { self.tools.setTool('edit'); self.select({ kind: 'seg', id: segId }); } }, '调整线形'),
            h('button', { class: 'btn sm danger', onclick: function () { self.demolish({ kind: 'seg', id: segId }); } }, '拆除区段')));
          const imp = self.demolishImpact({ kind: 'seg', id: segId });
          if (imp && imp.lines.length) b.appendChild(h('div', { class: 'note', style: { marginTop: '6px' } }, '拆除影响：' + imp.lines.join('；')));
          return b;
        }, true));
      }
      // 线路信息
      el.appendChild(this.sec('ln-edit', '线路颜色', '', function () {
        const b = h('div');
        // 线路颜色（v2.1）：本地图的标准配色、常见地铁配色与自定义取色器，立即生效、不产生费用
        const cur = function () { const n = g.draft ? g.draft.net : g.net; return (n.lines[lid] || line).color; };
        const swatches = [];
        const sw = function (c, cls) {
          const btn = h('button', { class: 'lc-sw' + (cls ? ' ' + cls : ''), 'data-tip': c, 'aria-label': '线路颜色 ' + c, style: { background: c }, onclick: function () { pick(c); } });
          btn.dataset.c = c.toLowerCase(); swatches.push(btn); return btn;
        };
        const colorInput = self.lineColorInput(cur, function (c) { pick(c, true); });
        const recentBox = h('div', { class: 'lc-row' });
        const mark = function () {
          const c = String(cur()).toLowerCase();
          for (const s of swatches) s.classList.toggle('on', s.dataset.c === c);
          colorInput.syncColor();
        };
        const renderRecent = function () {
          recentBox.replaceChildren();
          const rc = (CM.Settings.get('recentColors') || []).slice(0, 8);
          if (rc.length) { recentBox.appendChild(h('span', { class: 'tiny muted lc-k' }, '最近')); rc.forEach(function (c) { recentBox.appendChild(sw(c)); }); }
        };
        const pick = function (c, custom) {
          c = c.toLowerCase();
          self.setLineLook(lid, { color: c });
          if (custom) { const rc = (CM.Settings.get('recentColors') || []).filter(function (x) { return x !== c; }); rc.unshift(c); CM.Settings.set('recentColors', rc.slice(0, 8)); renderRecent(); }
          mark();
        };
        const std = h('div', { class: 'lc-row' }, h('span', { class: 'tiny muted lc-k' }, '本市'), D.lineColorsNice.map(function (c) { return sw(c); }));
        const common = h('div', { class: 'lc-row' }, h('span', { class: 'tiny muted lc-k' }, '常用'), LINE_PALETTE.filter(function (c) { return D.lineColorsNice.indexOf(c) < 0; }).map(function (c) { return sw(c); }));
        renderRecent();
        b.append(h('div', { class: 'field' }, h('label', null, '颜色'), colorInput),
          std, common, recentBox);
        mark();
        if (AX.enabled()) b.appendChild(h('div', { class: 'note' }, '色盲辅助模式按线路编号显示配色；这里设置的原色会保留，关闭辅助模式后恢复。'));
        b.appendChild(h('div', { class: 'row' },
          h('button', { class: 'btn sm danger', onclick: function () { g.edit(function (n) { for (const s of M.lineSegs(n, lid)) delete n.segments[s.id]; delete n.lines[lid]; }); self.select(null); self.toast('已在草案中拆除 ' + line.name + ' 全部轨道（车站保留，可单独拆除）', 'info'); } }, '拆除整条线路')));
        return b;
      }, true));
      // 批量修改：本线全部车站或轨道
      el.appendChild(this.sec('ln-batch', '批量修改', '', function () {
        return h('div', null, h('div', { class: 'row', style: { flexWrap: 'wrap', gap: '6px' } },
          h('button', { class: 'btn sm', onclick: function () { self.setMulti({ stations: tp.stations.slice(), segs: [] }); } }, '选中本线全部车站（' + tp.stations.length + '）'),
          h('button', { class: 'btn sm', onclick: function () { self.setMulti({ stations: [], segs: segs.map(function (s) { return s.id; }) }); } }, '选中本线全部轨道（' + segs.length + '）')),
          h('div', { class: 'note', style: { marginTop: '6px' } }, '也可以在地图上按住 Ctrl（或 Shift）点击多座车站或多段轨道进行多选。'));
      }));
    }
    return { title: line.name, el: el, highlightLine: lid, titleEdit: { value: line.name, max: 14, apply: function (v) { self.setLineLook(lid, { name: v }); } }, badgeClick: function (e) { if (CM.Quick) CM.Quick.popColor(lid, e.currentTarget); }, badgeTip: '改颜色' };
  };
  UI.prototype.loadChart = function (r, ri, W) {
    const g = this.g(), mnet = g.model.net, re = mnet.rideEdge[ri];
    const n = r.segRefs.length;
    const up = [], dn = [];
    let mx = 1;
    for (let k = 0; k < n; k++) { const a = g.model.edgeLoadAt(re[2 * k], W), b = g.model.edgeLoadAt(re[2 * k + 1], W); up.push(a); dn.push(b); mx = Math.max(mx, a, b); }
    const f = g.model.freqAt(ri, W), cap = f * g.model.capOf(ri, mnet);
    if (cap > mx) mx = cap;
    const Wd = 300, H = 90, bw = Wd / Math.max(1, n);
    let svg = '<svg viewBox="0 0 ' + Wd + ' ' + H + '" width="100%" height="' + H + '" preserveAspectRatio="none">';
    svg += '<line x1="0" y1="' + H / 2 + '" x2="' + Wd + '" y2="' + H / 2 + '" stroke="#ccd" stroke-width="1"/>';
    for (let k = 0; k < n; k++) {
      const hu = up[k] / mx * (H / 2 - 4), hd = dn[k] / mx * (H / 2 - 4);
      const cu = cap > 0 && up[k] > cap ? AX.color('#d63031') : AX.line(r.line || { id: r.lineId, color: r.color }), cd = cap > 0 && dn[k] > cap ? AX.color('#d63031') : AX.line(r.line || { id: r.lineId, color: r.color });
      svg += '<rect x="' + (k * bw + 1) + '" y="' + (H / 2 - hu) + '" width="' + Math.max(1, bw - 2) + '" height="' + hu + '" fill="' + cu + '" opacity="0.85"/>';
      svg += '<rect x="' + (k * bw + 1) + '" y="' + H / 2 + '" width="' + Math.max(1, bw - 2) + '" height="' + hd + '" fill="' + cd + '" opacity="0.55"/>';
    }
    if (cap > 0) { const y1 = H / 2 - cap / mx * (H / 2 - 4), y2 = H / 2 + cap / mx * (H / 2 - 4); svg += '<line x1="0" y1="' + y1 + '" x2="' + Wd + '" y2="' + y1 + '" stroke="#d63031" stroke-dasharray="4 3" stroke-width="1"/><line x1="0" y1="' + y2 + '" x2="' + Wd + '" y2="' + y2 + '" stroke="#d63031" stroke-dasharray="4 3" stroke-width="1"/>'; }
    svg += '</svg>';
    const first = g.compiled.stations[r.stIdx[0]], last = g.compiled.stations[r.stIdx[r.stIdx.length - 1]];
    return h('div', null, h('div', { html: svg }), h('div', { class: 'row between tiny muted' }, h('span', null, first ? first.name : ''), h('span', null, '红色虚线 = 当前运力'), h('span', null, last ? last.name : '')));
  };

  // ======================== 页面：批量修改 ========================
  // 多选车站统一升级、多选轨道统一建设方式：先预览合计费用与新增冲突，再作为一步加入草案（可整批撤销）
  UI.prototype.page_multi = function () {
    const g = this.g(), self = this, mu = this.multi;
    if (!mu || (!mu.stations.size && !mu.segs.size)) return null;
    const net = g.draft ? g.draft.net : g.net, mc = CFG.metro, ord = M.sizeList(g.clock.y);
    const st = Array.from(mu.stations).filter(function (id) { return net.stations[id]; });
    const sg = Array.from(mu.segs).filter(function (id) { return net.segments[id]; });
    const el = h('div');
    const razing = this.tools && this.tools.tool === 'demolish';
    el.appendChild(h('div', { class: 'note' }, razing ? '已选 ' + st.length + ' 座车站、' + sg.length + ' 段轨道（地图上以红色标出）。Ctrl+点击增减，Shift+拖动框选更多。' : '已选 ' + st.length + ' 座车站、' + sg.length + ' 段轨道（地图上以蓝色标出）。按住 Ctrl 或 Shift 点击地图可继续添加或移除。'));
    const chips = h('div', { class: 'chips' });
    const chip = function (label, color, onRemove) { return h('span', { class: 'chip' }, color ? h('span', { class: 'dot', style: { background: color } }) : null, label, h('button', { class: 'chip-x', 'data-tip': '移出多选', onclick: onRemove }, '×')); };
    for (const id of st) chips.appendChild(chip(net.stations[id].name, null, function () { self.toggleMulti('station', id); }));
    for (const id of sg) { const s = net.segments[id], L = net.lines[s.line]; chips.appendChild(chip((L ? L.name + ' ' : '') + net.stations[s.a].name + '—' + net.stations[s.b].name, L ? AX.line(L) : null, function () { self.toggleMulti('seg', id); })); }
    el.appendChild(chips);
    const delBtn = h('button', { class: 'btn sm danger', 'data-tip': '进入草案，可一次撤销', onclick: function () { self.demolishMulti(); } }, ic('bulldozer', 14), '拆除所选（' + (st.length + sg.length) + ' 项）');
    if (razing) {
      const imp = this.demolishImpact({ kind: 'many', stations: st, segs: sg }), box = h('div', { class: 'batch-pv' }, h('b', null, '拆除后的变化'));
      for (const l of imp && imp.lines.length ? imp.lines : ['不影响其他线路与车站']) box.appendChild(h('div', { class: 'small', style: { padding: '2px 0' } }, '· ' + l));
      el.append(box, h('div', { class: 'row', style: { marginTop: '10px' } }, h('button', { class: 'btn sm ghost', onclick: function () { self.clearMulti(); } }, '清空多选'), h('span', { class: 'grow' }), delBtn));
      return { title: '批量拆除', el: el };
    }
    // 混合属性
    const count = function (arr, key, names) { const m = {}; for (const x of arr) m[x[key]] = (m[x[key]] || 0) + 1; return Object.keys(m).map(function (k) { return names[k] + ' ' + m[k]; }).join(' · '); };
    if (st.length) el.appendChild(h('div', { class: 'small', style: { marginTop: '8px' } }, '车站规模：' + count(st.map(function (id) { return net.stations[id]; }), 'size', mc.sizeName)));
    if (sg.length) el.appendChild(h('div', { class: 'small' }, '轨道建设方式：' + count(sg.map(function (id) { return net.segments[id]; }), 'type', mc.typeName)));
    const pv = h('div');
    const preview = function (label, fn, nChanged) {
      pv.innerHTML = '';
      if (!nChanged) { pv.appendChild(h('div', { class: 'callout info' }, label + '：所选对象均已满足，无需修改。')); return; }
      const clone = M.clone(net); fn(clone);
      const ev0 = g.draft ? g.draftEval() : { total: 0, conflicts: [] };
      const ev1 = M.evaluate(clone, g.net, g.city, g.clock.y);
      const fresh = ev1.conflicts.filter(function (c) { return !ev0.conflicts.some(function (o) { return o.msg === c.msg; }); });
      const box = h('div', { class: 'batch-pv' }, h('b', null, label + '（' + nChanged + ' 项）'),
        self.kv([['本次批量费用', U.fmtMoney(Math.max(0, ev1.total - ev0.total))], ['草案合计', U.fmtMoney(ev1.total)], ['新增冲突', fresh.length ? fresh.length + ' 处' : '无', fresh.length ? 'bad' : 'good']]));
      for (const c of fresh.slice(0, 6)) box.appendChild(h('div', { class: 'small bad', style: { padding: '2px 0' } }, '· ' + c.msg));
      box.appendChild(h('div', { class: 'row', style: { marginTop: '8px' } }, h('span', { class: 'grow' }),
        h('button', { class: 'btn sm', onclick: function () { pv.innerHTML = ''; } }, '取消'),
        h('button', { class: 'btn sm primary', onclick: function () { const r = g.edit(fn); if (r && r.error) { self.toast(r.error, 'bad'); return; } self.toast('已把「' + label + '」加入草案（可一次撤销）', 'good'); } }, '加入草案')));
      pv.appendChild(box);
    };
    if (st.length) {
      el.appendChild(h('div', { class: 'field', style: { marginTop: '10px' } }, h('label', null, '统一车站规模（只升级，较大的车站保持不变）'),
        h('div', { class: 'seg-ctl' }, ord.slice(1).map(function (sz) {
          const n = st.filter(function (id) { return ord.indexOf(net.stations[id].size) < ord.indexOf(sz); }).length;
          return h('button', { onclick: function () { preview('统一升级为' + mc.sizeName[sz] + '车站', function (nn) { for (const id of st) { const s = nn.stations[id]; if (s && ord.indexOf(s.size) < ord.indexOf(sz)) s.size = sz; } }, n); } }, '至少' + mc.sizeName[sz] + '（' + n + '）');
        }))));
    }
    if (sg.length) {
      el.appendChild(h('div', { class: 'field', style: { marginTop: '10px' } }, h('label', null, '统一轨道建设方式（按新建计费）'),
        h('div', { class: 'seg-ctl' }, ['underground', 'surface', 'elevated'].map(function (t) {
          const n = sg.filter(function (id) { return net.segments[id].type !== t; }).length;
          return h('button', { onclick: function () { preview('统一改为' + mc.typeName[t], function (nn) { for (const id of sg) if (nn.segments[id]) nn.segments[id].type = t; }, n); } }, mc.typeName[t] + '（' + n + '）');
        }))));
    }
    el.appendChild(pv);
    el.appendChild(h('div', { class: 'row', style: { marginTop: '10px' } }, h('button', { class: 'btn sm ghost', onclick: function () { self.clearMulti(); } }, '清空多选'), h('span', { class: 'grow' }), delBtn));
    return { title: '批量修改', el: el };
  };

  // ======================== 页面：道路 / 片区 ========================
  UI.prototype.page_road = function (id) {
    const g = this.g(), model = g.model, road = model.road, L = road.links[id];
    if (!L) return null;
    const self = this;
    const el = h('div');
    const name = g.city.roadNames[L.name] || (L.cls === 2 ? '次干道' : '道路');
    const clsName = ['', '支路', '次干道', '主干道', '快速路'][L.cls];
    el.appendChild(h('div', { class: 'row', style: { marginBottom: '8px' } }, h('span', { class: 'tag' }, clsName), L.bridge ? h('span', { class: 'tag info' }, '桥梁/隧道') : null, h('span', { class: 'tag' }, U.fmtKm(L.lenM))));
    const grid = h('div', { class: 'stat-grid' });
    const s0 = this.stat('方向 A 流量', '—'), s1 = this.stat('方向 B 流量', '—');
    grid.append(s0, s1);
    el.appendChild(grid);
    const upd = function () {
      const W = model.weights(g.clock.minute);
      for (let d = 0; d < 2; d++) {
        const a = 2 * L.id + d, v = model.arcVolAt(a, W), x = v / model.cap(a), r = model.arcRatioAt(a, W);
        (d ? s1 : s0).setV(U.fmtInt(v) + ' 辆/时', '饱和度 ' + x.toFixed(2) + ' · 车速 ' + Math.round(CFG.road.speed[L.cls] / Math.min(8, r)) + ' km/h', x > 1 ? 'bad' : (x > 0.8 ? 'warn' : 'muted'));
      }
    };
    upd(); this.live.push(upd);
    el.appendChild(this.kv([['单向通行能力', U.fmtInt(model.cap(2 * L.id)) + ' 辆/小时'], ['自由流速度', CFG.road.speed[L.cls] + ' km/h']]));
    // 拥堵变化（v2.3）：工作日早高峰拥堵比（两方向较大者）与对比基准相比
    const Pw = model.resultsFor('wd').per[0], nowR = Math.max(Pw.arcTime[2 * L.id] / road.arcT0[2 * L.id], Pw.arcTime[2 * L.id + 1] / road.arcT0[2 * L.id + 1]), rows = [['工作日早高峰拥堵比', nowR.toFixed(2)]];
    for (const k of ['build', 'year']) {
      const ref = g.congRefFor ? g.congRefFor(k) : null; if (!ref) continue;
      const q0 = ref.q[2 * L.id], q1 = ref.q[2 * L.id + 1]; if (q0 === 255 || q1 === 255) continue;
      const r0 = 1 + Math.max(q0, q1) / 100, dv = nowR - r0;
      rows.push([(k === 'build' ? '建设以来' : '一年来') + '（' + Math.floor(ref.ym / 12) + '年' + (ref.ym % 12 + 1) + '月起）', h('span', { style: { color: dv <= -0.03 ? 'var(--good)' : (dv >= 0.03 ? 'var(--bad)' : 'var(--muted)') } }, r0.toFixed(2) + ' → ' + nowR.toFixed(2) + '（' + (dv < 0 ? '−' : '+') + Math.abs(dv).toFixed(2) + '）')]);
    }
    el.appendChild(this.kv(rows));
    el.appendChild(h('div', { class: 'small muted', style: { margin: '10px 0 2px' } }, '全天饱和度变化（' + (model.dayType === 'we' ? '今天为周末' : '今天为工作日') + '，两方向较大者）'));
    const vals = [];
    for (let hr = 0; hr < 24; hr++) { const W = model.weights(hr * 60 + 30); vals.push(Math.max(model.arcVolAt(2 * L.id, W), model.arcVolAt(2 * L.id + 1, W)) / model.cap(2 * L.id)); }
    el.appendChild(this.spark(vals, { color: '#e8642c', ref: 1, labels: ['0 时', '12 时', '24 时'] }));
    el.appendChild(h('div', { class: 'note', style: { marginTop: '8px' } }, '拥堵比 = 行驶时间 ÷ 自由流时间。地铁开通后约 4 年里，沿线道路会逐步缓解。'));
    return { title: name, el: el };
  };
  UI.prototype.page_zone = function (z) {
    const g = this.g(), model = g.model, self = this;
    const el = h('div');
    const acc = model.net ? model.net.acc : null;
    const P = model.ctxs.wd.per[0];
    el.appendChild(this.kv([
      ['范围', '约 1 km × 1 km 交通小区'],
      ['常住人口', U.fmtPeople(model.zPop[z])], ['就业岗位', U.fmtPeople(model.zJobs[z])],
      ['地铁覆盖（步行 15 分钟）', acc ? U.fmtPct(acc.zCov[z]) : '0%'],
      ['工作日早高峰出发地铁占比', P.zTrips[z] > 0 ? U.fmtPct(P.zMetro[z] / P.zTrips[z]) : '—'],
      ['工作日早高峰道路拥堵指数', g.zoneCong(z, 'wd').toFixed(2)],
      ['住在这里的人平均通勤', (function () { const R0 = model.resultsFor('wd').per[0]; return R0.zCW && R0.zCW[z] > 0 ? U.fmtNum(R0.zCT[z] / R0.zCW[z], 1) + ' 分钟' : '—'; })()],
    ]));
    // 普通设施（按片区汇总）吸引的出行：分目的，工作日与周末（模拟结果）
    if (model.facData('wd') && model.facData('we')) {
      const Z = model.Z, a = model.facDaily.wd, b = model.facDaily.we, TR = CFG.trips;
      const t = h('table', { class: 'tbl' }, h('tr', null, h('th', null, '出行目的'), h('th', null, '工作日'), h('th', null, '周末'), h('th', null, '乘地铁（工作日）')));
      let any = false;
      ['hw', 'sc', 'sh', 'md', 'lz'].forEach(function (k) {
        const qi = TR.keys.indexOf(k), v1 = a.dest[qi * Z + z], v2 = b.dest[qi * Z + z], m1 = a.destM[qi * Z + z];
        if (v1 < 1 && v2 < 1) return; any = true;
        t.appendChild(h('tr', null, h('td', null, h('span', { class: 'dot', style: { background: AX.category(TR.keys.indexOf(k), TR.color[k]), marginRight: '6px' } }), TR.name[k]), h('td', null, U.fmtPeople(v1)), h('td', null, U.fmtPeople(v2)), h('td', null, v1 > 0 ? U.fmtPct(m1 / v1, 0) : '—')));
      });
      if (any) el.appendChild(this.sec('z-att', '片区吸引的出行（普通设施汇总）', '人次/日', function () { return h('div', null, t, h('div', { class: 'note', style: { marginTop: '6px' } }, '普通设施按片区汇总，重要设施单独计算。')); }, true));
      const here = model.fn.list.filter(function (f, k) { return model.fn.hostZ[Z + k] === z; });
      if (here.length) el.appendChild(this.sec('z-fac', '片区内的重要设施', here.length + ' 处', function () {
        const bx = h('div');
        for (const f of here) bx.appendChild(h('div', { class: 'chg small clickable', onclick: function () { self.select({ kind: 'facility', id: f.id }); } }, h('span', null, ic(f.T.icon), ' ', f.name), h('span', { class: 'muted' }, f.T.name)));
        return bx;
      }, true));
    }
    // 如何提高本片区乘地铁占比（v2.1 玩家反馈）：覆盖、去向与拥堵的诊断，附可以马上做的操作
    el.appendChild(this.sec('z-how', '如何提高本片区乘地铁占比', '', function () {
      const cov = acc ? acc.zCov[z] : 0, share = P.zTrips[z] > 0 ? P.zMetro[z] / P.zTrips[z] : 0, cong = g.zoneCong(z, 'wd'), items = [];
      const build = function () { self.tools.setTool('station'); self.locateZone(z); self.toast('点击空地建站，再用「绘线」接入线路', 'info'); };
      if (model.zPop[z] < 200) items.push(['info', '片区人口很少', '优先在人多的片区设站。', []]);
      else if (cov < 0.5) items.push([cov < 0.15 ? 'bad' : 'warn', '只有 ' + U.fmtPct(cov, 0) + ' 的范围能步行到车站', '在片区中心或人最多的地方设站。', [['station', '在片区建站', build, true]]]);
      else items.push(['good', U.fmtPct(cov, 0) + ' 的范围能步行到车站', '', []]);
      items.push([share < 0.15 && cov >= 0.5 ? 'warn' : 'info', '早高峰乘地铁 ' + U.fmtPct(share, 0), '看「出行方向」，把线修到居民要去的地方。', [['lyFlow', '出行方向图层', function () { self.setLayer('flow'); }]]]);
      if (cong >= 1.35) items.push(['warn', '早高峰拥堵指数 ' + cong.toFixed(2), '沿车流方向修线，把开车的人吸引到地铁。', []]);
      return self.howBox(items, cong >= 1.35 ? 'cong' : 'zone');
    }, true, 'sparkle'));
    const x = model.zCx[z], y = model.zCy[z];
    const rg = g.city.regionAt(x, y);
    if (rg) el.appendChild(h('div', { class: 'note', style: { marginTop: '8px' } }, '所属区域：' + rg.name + '（' + g.city.regionLockText(g.city.regions.indexOf(rg)) + '）'));
    el.appendChild(h('div', { class: 'row', style: { marginTop: '8px' } }, h('button', { class: 'btn sm ghost', onclick: function () { self.locateZone(z); } }, '定位')));
    return { title: g.zoneName(z), el: el };
  };

  // ======================== 页面：重要设施（v1.9） ========================
  // 规模、工作日与周末到访、出行目的、附近地铁站与接驳；区分史实资料、估算与模拟结果
  UI.prototype.page_facility = function (id) {
    const g = this.g(), model = g.model, self = this, Fac = CM.Fac, TR = CFG.trips;
    const f = Fac.byId(id); if (!f) return null;
    const el = h('div');
    const yr = g.year(), k = model.facIndex(id), active = k >= 0;
    const status = active ? '运营中' : (yr < f.open ? Math.floor(f.open) + ' 年启用' : (f.close != null && yr >= f.close ? '已停用（' + Math.floor(f.close) + ' 年）' : '暂未运营'));
    el.appendChild(h('div', { class: 'row', style: { flexWrap: 'wrap', marginBottom: '8px' } },
      h('span', { class: 'tag' }, ic(f.T.icon), ' ', f.ext && f.ext.gate ? '口岸' : f.T.name), f.ext ? h('span', { class: 'tag info' }, f.ext.gate ? (CM.DATA.cityLink ? '城市连接 · 接驳口' : '跨境接驳口') : '地图外 · 边缘接驳口') : null, h('span', { class: 'tag' }, Fac.purposeText(f)), h('span', { class: 'tag ' + (active ? 'good' : 'warn') }, status),
      Fac.sources(f).map(function (s) { return h('span', { class: 'tag ' + s[1] }, s[0]); })));
    el.appendChild(this.kv([
      f.ext ? ['设施位置', Fac.extText(f) + '（图上为接驳点）'] : null,
      f.ext ? ['地铁接通', (function () {
        const lk = Fac.extLink(f, g);
        if (f.ext.gate) { if (!lk) return '未接通：把线路修到接驳口（会自动吸附），附近的普通车站不算'; return '已接通 ⇄ 经接驳口车站「' + lk.st.name + '」' + Fac.extText(f) + (CM.DATA.cityLink ? '。附加费和切换城市在地铁芯的「口岸管理」' : ''); }
        if (!lk) return '未接通：把线路修到地图边缘的接驳口（会自动吸附），或在接驳口约 800 m 内建站';
        const names = lk.lines.map(function (lid) { const L = g.net.lines[lid]; return L ? L.name : ''; }).filter(Boolean).join('、');
        return '已接通 ⇄ 经' + (lk.portal ? '接驳口车站' : '') + '「' + lk.st.name + '」' + (names ? '（' + names + '）' : '') + '在地图边缘连接地图外' + (lk.portal ? '，全部接驳出行可乘地铁' : '');
      })()] : null,
      ['参考规模（估算）', Fac.sizeText(f, yr)],
      ['启用', f.open > -1e8 ? (f.lmK >= 0 ? D.landmarks[f.lmK].year + ' 年（地标落成）' : Math.floor(f.open) + ' 年') : '开局前已有'],
      f.close != null ? ['停用', Math.floor(f.close) + ' 年 ' + Math.round((f.close % 1) * 12 + 1) + ' 月'] : null,
    ]));
    if (f.note) el.appendChild(h('div', { class: 'note', style: { margin: '4px 0 8px' } }, f.note));
    if (!active) {
      el.appendChild(this.callout('info', 'info', '设施' + status + '，目前不参与出行计算。'));
    } else {
      const hub = !!f.T.hub;
      // 到访量（模拟结果）：工作日 / 周末 / 周平均
      const grid = h('div', { class: 'stat-grid' });
      const sW = this.stat(hub ? '工作日接驳出行' : '工作日到访', '—'), sE = this.stat(hub ? '周末接驳出行' : '周末到访', '—'), sA = this.stat('周平均', '—'), sM = this.stat('乘地铁比例（周平均）', '—');
      grid.append(sW, sE, sA, sM);
      el.appendChild(grid);
      const vol = function (s) { return s ? (hub ? s.inn + s.out : s.inn) : 0; }, met = function (s) { return s ? (hub ? s.innM + s.outM : s.innM) : 0; };
      const upd = function () {
        const a = model.facStats(id, 'wd'), b = model.facStats(id, 'we'), c = model.facStats(id, 'avg');
        if (!a || !b || !c) return;
        sW.setV(U.fmtPeople(vol(a)) + ' 人次', '地铁 ' + U.fmtPct(vol(a) > 0 ? met(a) / vol(a) : 0, 0), 'muted');
        sE.setV(U.fmtPeople(vol(b)) + ' 人次', '地铁 ' + U.fmtPct(vol(b) > 0 ? met(b) / vol(b) : 0, 0), 'muted');
        sA.setV(U.fmtPeople(vol(c)) + ' 人次', '5 个工作日 + 2 个周末日', 'muted');
        const sh = vol(c) > 0 ? met(c) / vol(c) : 0;
        sM.setV(U.fmtPct(sh, 0), '汽车（含公交、出租） ' + U.fmtPct(1 - sh, 0), sh >= 0.3 ? 'good' : (sh < 0.1 ? 'bad' : 'muted'));
      };
      upd(); this.live.push(upd);
      // 出行目的
      el.appendChild(this.sec('f-purp', '出行目的（' + (hub ? '去往车站 / 机场' : '到达') + '，人次/日）', '工作日 · 周末', function () {
        const a = model.facStats(id, 'wd'), b = model.facStats(id, 'we'), t = h('table', { class: 'tbl' }, h('tr', null, h('th', null, '目的'), h('th', null, '工作日'), h('th', null, '周末'), h('th', null, '乘地铁')));
        if (a && b) for (const q of TR.keys) { if (a.purp[q] < 1 && b.purp[q] < 1) continue; const sum = a.purp[q] + b.purp[q], metro = a.purpM[q] + b.purpM[q]; t.appendChild(h('tr', null, h('td', null, h('span', { class: 'dot', style: { background: AX.category(TR.keys.indexOf(q), TR.color[q]), marginRight: '6px' } }), TR.name[q]), h('td', null, U.fmtPeople(a.purp[q])), h('td', null, U.fmtPeople(b.purp[q])), h('td', null, U.fmtPct(sum > 0 ? metro / sum : 0, 0)))); }
        return h('div', null, t, h('div', { class: 'note', style: { marginTop: '6px' } }, hub ? '旅客往返车站或机场的市内出行；修地铁不会增加旅客量。' : '只含汽车与地铁出行；通地铁后购物、休闲到访会适度增加。'));
      }, true));
      // 附近地铁站与接驳
      el.appendChild(this.sec('f-acc', '附近地铁站与接驳', '', function () {
        const bx = h('div'), acc = model.net ? model.net.acc : null, node = model.Z + k;
        const list = acc && acc.NZ === model.fn.NZ ? acc.zl[node] : null;
        if (acc && acc.NZ === model.fn.NZ) bx.appendChild(self.kv([['场地步行 15 分钟内可达车站', U.fmtPct(acc.zCov[node], 0) + ' 的场地'], ['平均步行时间', acc.zCov[node] > 0 ? U.fmtNum(acc.zWalk[node], 1) + ' 分钟' : '—']]));
        if (!list || !list.length) {
          // 有车站就在附近却走不到时说明原因（v2.6.1 玩家反馈）：步行距离按道路计算，水面、铁路和没有路的地方都要绕行
          const C = model.net ? model.net.C : null; let ns = null, nd = 1e9;
          if (C) C.stations.forEach(function (s, i) { if (!C.serviced[i]) return; const d = U.dist(s.x, s.y, f.x, f.y); if (d < nd) { nd = d; ns = s; } });
          const m = nd * CFG.CELL_M;
          bx.appendChild(h('div', { class: 'callout warn' }, ns && m < 3000 ? '最近的运营车站「' + ns.name + '」直线约 ' + U.fmtKm(m) + '，但沿道路走不到这里：步行按道路计算，要绕过水面、铁路和没有路的地方，上限 15 分钟。在设施 400 m 内设站并接入线网后，' + (hub ? '旅客' : '到访者') + '才能乘地铁前往。' : '步行 15 分钟内没有运营中的地铁站。在附近设站并接入线网后，' + (hub ? '旅客' : '到访者') + '才能乘地铁前往。'));
        } else for (const e of list) {
          const s = model.net.C.stations[e.s]; if (!s) continue;
          const lines = Array.from(model.net.C.stationLines[e.s] || []).map(function (lid) { return g.net.lines[lid]; }).filter(Boolean);
          bx.appendChild(h('div', { class: 'chg small clickable', onclick: function () { self.select({ kind: 'station', id: s.id }); } }, h('span', null, lines.map(function (L) { return h('span', { class: 'dot', style: { background: AX.line(L), marginRight: '4px' } }); }), s.name), h('span', { class: 'num' }, '步行约 ' + Math.max(1, Math.round(e.w)) + ' 分钟')));
        }
        return bx;
      }, true));
      // 如何提高乘地铁比例（v2.1 玩家反馈）：按当前状态诊断，给出可以马上做的改进与入口
      el.appendChild(this.sec('f-how', '如何提高乘地铁比例', '', function () {
        const acc = model.net ? model.net.acc : null, node = model.Z + k;
        const list = acc && acc.NZ === model.fn.NZ ? (acc.zl[node] || []) : [], C = model.net ? model.net.C : null;
        const best = list.length ? list.reduce(function (a, b) { return b.w < a.w ? b : a; }) : null, bs = best && C ? C.stations[best.s] : null;
        const near = function () { self.tools.setTool('station'); self.locatePoint(f.x, f.y, f.name, Math.max(0.8, f.r), 3); self.toast('点击空地建站，再用「绘线」接入线路', 'info'); };
        const items = [];
        if (f.ext) {
          const lk = Fac.extLink(f, g);
          items.push(f.ext.gate ? (lk ? ['good', '已接通' + (f.ext.to || '对岸'), '', CM.DATA.cityLink ? [['bridge', '口岸管理', function () { self.openOpsApp('gates'); }]] : []] : ['bad', '还没接通' + (f.ext.to || '对岸'), '把线路修到接驳口。', [['route', '开始绘线', function () { self.tools.setTool('line'); }, true]]])
            : lk && !lk.portal ? ['warn', '经「' + lk.st.name + '」步行接驳约 ' + Math.max(1, Math.round(best ? best.w : 0)) + ' 分钟', '把线路修到地图边缘的接驳口，旅客下车就能换乘，乘地铁的比例会更高。', [['route', '开始绘线', function () { self.tools.setTool('line'); }]]]
            : lk ? ['good', '已在地图边缘接通', '', []] :
            ['bad', '还没接通地图外的' + f.T.name, '把线路修到地图边缘的接驳口。', [['route', '开始绘线', function () { self.tools.setTool('line'); }, true]]]);
        } else if (!bs) items.push(['bad', '附近没有车站', '在设施 400 m 内建站并接入线路。', [['station', '在附近建站', near, true]]]);
        else if (best.w > 7) items.push(['warn', '最近车站「' + bs.name + '」要走 ' + Math.round(best.w) + ' 分钟', '在 400 m 内加站，或把车站移近（250 m 内免费）。', [['station', '在附近建站', near]]]);
        else items.push(['good', '步行 ' + Math.max(1, Math.round(best.w)) + ' 分钟到「' + bs.name + '」', '', []]);
        if (bs || (f.ext && Fac.extLink(f, g))) {
          const lineSet = new Set(); if (C) for (const e of list) for (const lid of C.stationLines[e.s] || []) lineSet.add(lid);
          if (lineSet.size <= 1) items.push(['warn', lineSet.size ? '只有 1 条线路' : '附近车站还没有线路', '再修一条直达主要客源的线，或在这里换乘。', [['lyFlow', '出行方向图层', function () { self.setLayer('flow'); }]]]);
          else items.push(['good', lineSet.size + ' 条线路服务', '', []]);
        }
        items.push(['info', '票价 ' + UI.fareText(g.econ.fare), '票价越高，乘地铁的人越少。', []]);
        items.push(['info', '地图上圆环的颜色', '表示乘地铁的比例：红色是比例低（0% 左右），绿色是 60% 以上。接通地铁后比例要等客流算完才上升，也可能因为到访者多来自没通地铁的地方而一直偏低。', []]);
        return self.howBox(items, 'fac');
      }, true, 'sparkle'));
    }
    el.appendChild(this.sec('f-src', '数据说明', '', function () {
      return h('div', { class: 'note' }, D.fictional ? '虚构城市的设施：位置、年份与规模均为游戏设定。' : '位置与年份为史实参考，规模为估算，到访量为模拟结果。');
    }));
    el.appendChild(h('div', { class: 'row', style: { marginTop: '8px' } },
      h('button', { class: 'btn sm ghost', onclick: function () { self.locatePoint(f.x, f.y, f.name, Math.max(0.8, f.r), 3); } }, '定位'),
      active ? h('button', { class: 'btn sm ghost', onclick: function () { self.openPage('zone', model.fn.hostZ[model.Z + k]); } }, '所在片区') : null));
    return { title: f.name, el: el };
  };

  // ======================== 页面：指标 ========================
  UI.prototype.page_metric = function (key) {
    const g = this.g(), d = g.model.daily || {}, self = this;
    const el = h('div');
    const hist = g.history;
    const defs = {
      pop: { title: '人口', val: function () { return U.fmtPeople(g.city.totals().pop); }, series: function (r) { return r.pop; }, def: '地图范围内的常住人口。', scope: '统计范围：全图（约 ' + U.fmtNum(CFG.W * CFG.CELL_M / 1000, 0) + ' km × ' + U.fmtNum(CFG.H * CFG.CELL_M / 1000, 0) + ' km）；更新：每月城市发展结算；' + (CM.DATA.fictional ? '虚构城市，人口按模拟规则发展。' : CFG.growth.histEnd + ' 年前为参考统计的估算，之后为模拟。'), factors: ['历史人口增长参考曲线', '区域开放（时间与人口共同决定）', '地铁覆盖率提高可吸引更多人口（最多约 +6%）', '城市经济景气：繁荣时人口增长加快、新区可提前开放，衰退时放缓（真实城市）', '各街区的可达性、地铁车站邻近度与规划用地'] },
      share: { title: '地铁分担率', val: function () { return U.fmtPct(d.metroShare || 0); }, series: function (r) { return r.share; }, pct: true, def: '采用地铁的完整出行次数 ÷ 全部完整出行次数。换乘不重复计为新出行。', scope: '周平均日；非地铁出行含汽车与电车、渡轮等背景交通。', factors: ['起终点步行接驳时间（沿道路计算）', '候车时间（由发车间隔决定）与换乘次数', '车厢拥挤与车站拥挤', '票价与居民时间价值', '汽车出行时间（道路拥堵）与停车费用'] },
      cong: { title: '道路拥堵指数', val: function () { return (d.cong || 1).toFixed(2) + '（全日） / ' + (d.congAM || 1).toFixed(2) + '（早高峰）'; }, series: function (r) { return r.cong; }, def: '行驶时间 ÷ 自由流时间（按车公里加权）：1.15 起缓行，1.35 起拥堵，1.60 起严重拥堵。', scope: '全图主要道路；顶栏为当前时刻，全日为周平均日。', factors: ['人口与出行需求增长', '汽车拥有水平（随年代上升）', '地铁对汽车出行的吸引（不按固定比例下降）', '道路与桥梁的系统建设'] },
      commute: { title: '平均通勤时间', val: function () { return U.fmtNum((g.model.dailyWk || d).commute || 0, 1) + ' 分钟'; }, series: function (r) { return r.commute; }, def: '家—工作出行的门到门平均时间。', scope: '包含步行接驳、候车、乘车、换乘、停车取车；统计口径：工作日（通勤以工作日为准）。', factors: ['道路拥堵', '地铁线路的直达性与换乘便利', '居住与就业分布（城市扩张会拉长通勤）'] },
      sat: { title: '居民满意度', val: function () { return Math.round(g.econ.sat) + ' / 100'; }, series: function (r) { return r.sat; }, def: '综合交通服务、票价与任务结果的满意度评分（0–100）。', scope: '每月更新，每月向目标值靠近 25%；影响政府拨款系数（经营挑战）。', factors: [] },
    };
    const def = defs[key];
    if (!def) return null;
    el.appendChild(h('div', { style: { fontSize: '22px', fontWeight: 700, margin: '4px 0 8px' } }, this.liveText(def.val)));
    // 指标自带的图层（v2.2 界面整理）：打开详情时已在地图上显示，可在这里关闭或重新打开；图例在地图左上角
    const LY = this.pills[key] && this.pills[key].layer ? UI.LAYERS.find(function (x) { return x.id === self.pills[key].layer; }) : null;
    if (LY) {
      const on = this.layer === LY.id;
      const row = h('button', { class: 'metric-layer' + (on ? ' on' : ''), role: 'switch', 'aria-checked': on ? 'true' : 'false', 'data-silent': '1',
        onclick: function () { self.setLayer(self.layer === LY.id ? 'none' : LY.id); } },
        h('span', { class: 'ml-ico' }, CM.icon(LY.icon, 16)), h('span', { class: 'grow' }, h('b', null, '地图图层：' + LY.name), h('small', null, LY.desc)), h('span', { class: 'switch' + (on ? ' on' : '') }, h('i')));
      row.style.setProperty('--lc', LY.color);
      el.appendChild(row);
    }
    if (key === 'share' && d.ready) {
      const dw = g.model.dailyWk || d, de = g.model.dailyWe || d;
      el.appendChild(this.kv([['日均出行（全方式，周平均）', U.fmtPeople(d.trips) + ' 人次'], ['其中地铁', U.fmtPeople(d.metro) + ' 人次'], ['工作日 / 周末分担率', U.fmtPct(dw.metroShare || 0) + ' / ' + U.fmtPct(de.metroShare || 0)], ['工作日 / 周末地铁客运量', U.fmtPeople(dw.metro || 0) + ' / ' + U.fmtPeople(de.metro || 0) + ' 人次'], ['步行 15 分钟可达地铁的人口', U.fmtPct(d.coverage)], ['平均票价', d.metro > 0 ? U.fmtNum(U.cur(d.avgFare), 2) + ' ' + CFG.money.unit : '—']]));
    }
    if(key==='cong'||key==='share')el.appendChild(this.trafficImpactBlock());
    if (key === 'cong') {
      const W = g.model.weights(g.clock.minute);
      el.appendChild(this.kv([['当前时刻', g.model.cityCongAt(W).toFixed(2)], ['汽车行驶里程（日）', U.fmtPeople(d.vkt) + ' 车公里']]));
    }
    if (key === 'sat' && g.econ.satFactors) {
      const sf = g.econ.satFactors;
      const t = h('div');
      t.appendChild(h('div', { class: 'chg small' }, h('span', null, '基准'), h('span', { class: 'num' }, '+' + sf.base)));
      for (const f of sf.factors) t.appendChild(h('div', { class: 'chg small' }, h('span', null, f.label), h('span', { class: 'num ' + (f.v >= 0 ? 'good' : 'bad') }, U.fmtSigned(f.v, 1))));
      t.appendChild(h('div', { class: 'chg small' }, h('b', null, '目标值'), h('b', { class: 'num' }, Math.round(sf.target))));
      el.appendChild(this.sec('m-satf', '构成因素（上月）', '', function () { return t; }, true));
    }
    el.appendChild(h('div', { class: 'note', style: { margin: '2px 0 6px' } }, def.def));
    el.appendChild(this.sec('m-about', '统计口径与影响因素', '', function () { const b = h('div', { class: 'note' }, def.scope); for (const f of def.factors) b.appendChild(h('div', { class: 'small', style: { padding: '2px 0', color: 'var(--text)' } }, '· ' + f)); return b; }, false, 'info'));
    if (hist.length > 1) {
      el.appendChild(this.sec('m-trend', '变化趋势', '近 ' + Math.min(120, hist.length) + ' 个月', function () {
        const arr = hist.slice(-120);
        return h('div', null, self.spark(arr.map(def.series), { color: '#1e6fd9', labels: [arr[0].y + '年' + arr[0].m + '月', '', arr[arr.length - 1].y + '年' + arr[arr.length - 1].m + '月'] }));
      }, true));
    }
    return { title: def.title, el: el };
  };
  UI.prototype.spark = function (vals, o) {
    o = o || {};
    const W = 300, H = 56;
    let mn = Math.min.apply(null, vals), mx = Math.max.apply(null, vals);
    if (o.ref !== undefined) { mn = Math.min(mn, 0); mx = Math.max(mx, o.ref * 1.1); }
    if (mx - mn < 1e-9) { mx = mn + 1; }
    const pts = vals.map(function (v, i) { return (i / Math.max(1, vals.length - 1) * W).toFixed(1) + ',' + (H - 4 - (v - mn) / (mx - mn) * (H - 8)).toFixed(1); }).join(' ');
    let svg = '<svg class="spark" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none">';
    if (o.ref !== undefined) { const y = H - 4 - (o.ref - mn) / (mx - mn) * (H - 8); svg += '<line x1="0" x2="' + W + '" y1="' + y + '" y2="' + y + '" stroke="#d63031" stroke-dasharray="4 3" stroke-width="1"/>'; }
    svg += '<polyline points="' + pts + '" fill="none" stroke="' + (o.color || '#1e6fd9') + '" stroke-width="2" vector-effect="non-scaling-stroke"/></svg>';
    const box = h('div', { html: svg });
    if (o.labels) box.appendChild(h('div', { class: 'row between tiny muted' }, o.labels.map(function (l) { return h('span', null, l); })));
    return box;
  };

  // ======================== 页面：日期与城市 ========================
  UI.prototype.page_date = function () {
    const g = this.g(), self = this;
    const el = h('div');
    el.appendChild(h('div', { style: { fontSize: '18px', fontWeight: 700 } }, this.liveText(function () { return g.clock.y + '年' + g.clock.m + '月' + g.clock.d + '日 ' + U.fmtClock(g.clock.minute); })));
    el.appendChild(h('div', { class: 'row', style: { margin: '6px 0 10px' } }, h('span', { class: 'tag' }, g.stageName()), g.clock.y > CFG.growth.histEnd ? h('span', { class: 'tag sim' }, '模拟未来') : h('span', { class: 'tag hist' }, '参考历史'),
      this.liveText(function () { return UI.weekdayName(g.clock); }, 'tag'),
      this.liveText(function () { return CFG.periods[g.model.hourPeriod[Math.floor(g.clock.minute / 60) % 24]].name; }, 'tag info')));
    el.appendChild(this.sec('dt-time', '时间与时段', '', function () {
      return h('div', { class: 'note' }, '1× 速度下一天约 ' + Math.round(CFG.time.secPerHour * 24) + ' 秒；早高峰 7–9 时、晚高峰 17–19 时，地铁 06:00–24:00 运营；工作日与周末分别模拟。暂停时也可以建设。');
    }));
    // 历史发展阶段（v2.2）：独立的「发展阶段」页面（顶栏阶段标签同样可打开）
    const ev = CM.Eras && CM.Eras.view(g);
    if (ev) el.appendChild(h('button', { class: 'ms-link', onclick: function () { self.openPage('era', null, { root: true }); } },
      h('span', { class: 'ms-medal sm', style: { background: UI.ERA_COLORS[CM.Eras.index(g.year()) % UI.ERA_COLORS.length] } }, CM.icon('calYear', 18)),
      h('div', { class: 'grow' }, h('b', null, '发展阶段 · ' + ev.era.name), h('small', null, '本阶段的城市变化、阶段目标与往期总结')), CM.icon('chev', 16)));
    // 城市发展的关键节点见统计面板的「里程碑」（区域开放与逐条发展记录不在这里重复列出）
    const ms = CM.Milestones ? CM.Milestones.state(g).list.filter(function (r) { return r.id !== 'start'; }) : [];
    const last = ms[ms.length - 1];
    el.appendChild(h('button', { class: 'ms-link', onclick: function () { self.openStats('milestones'); } },
      h('span', { class: 'ms-medal sm' }, CM.icon('book', 18)),
      h('div', { class: 'grow' }, h('b', null, '城市纪事 · ' + ms.length + ' 个里程碑'), h('small', null, last ? '最近：' + last.title + '（' + last.y + '年' + last.m + '月）' : '首条地铁开通、人口与客流跨越关口等关键节点会记录在这里')),
      CM.icon('chev', 16)));
    const trG = CM.Traits ? CM.Traits.view(g) : [], trStars = []; trG.forEach(function (m) { m.items.forEach(function (x) { if (x.star) trStars.push(x.label); }); });
    if (trG.length) el.appendChild(h('button', { class: 'ms-link', onclick: function () { self.openStats('traits'); } },
      h('span', { class: 'ms-medal sm' }, CM.icon('sparkle', 18)),
      h('div', { class: 'grow' }, h('b', null, '城市特色'), h('small', null, trStars.join('、'))), CM.icon('chev', 16)));
    if (g.macro && CM.Macro) {
      const mv = CM.Macro.view(g);
      el.appendChild(h('button', { class: 'ms-link alt', onclick: function () { self.openTop('econ'); } },
        h('span', { class: 'ms-medal sm alt' }, CM.icon('trend', 18)),
        h('div', { class: 'grow' }, h('b', null, '城市经济 · ' + mv.env.label), h('small', null, (mv.last ? mv.last.y + ' 年 GDP ' + UI.fmtBig(mv.last.nom) + (mv.last.growth != null ? '，实际增长 ' + UI.pctS(mv.last.growth) : '') : '本年 GDP 预测 ' + UI.fmtBig(mv.fc.nom)) + ' · ' + mv.trendLabel)),
        CM.icon('chev', 16)));
    }
    if (D.briefing) el.appendChild(h('button', { class: 'ms-link alt', onclick: function () { self.showBriefing(); } },
      h('span', { class: 'ms-medal sm alt' }, CM.icon('briefing', 18)),
      h('div', { class: 'grow' }, h('b', null, '开局简报'), h('small', null, CFG.START.y + ' 年这座城市的交通格局与你的起点')),
      CM.icon('chev', 16)));
    el.appendChild(this.sec('dt-data', '数据来源与真实性', '', function () { return self.dataNote(); }));
    return { title: '日期与城市发展', el: el };
  };
  // ======================== 页面：发展阶段（v2.2 阶段可视化） ========================
  // 阶段时间轴 → 当前阶段背景（史实 / 估算分开）→ 本阶段以来的城市变化（数字 + 在地图上看）→ 片区排行 → 发展倾向与走廊 →
  // 生效中的事件影响 → 阶段目标 → 往期阶段
  UI.prototype.page_era = function () {
    const g = this.g(), self = this, E = CM.Eras;
    const v = E && E.view(g); if (!v) return { title: '发展阶段', el: h('div', { class: 'note' }, '这张地图没有设置发展阶段。') };
    const L = E.list(), k = L.indexOf(v.era), col = function (i) { return UI.ERA_COLORS[i % UI.ERA_COLORS.length]; };
    const el = h('div', { class: 'era-page', style: { '--ec': col(k) } });
    // 时间轴：各阶段按年份等比排列，当前时刻为一个小三角
    const t = g.year(), y0 = L[0].from, y1 = Math.max(t + 1, (L[L.length - 1].from + 10));
    const tl = h('div', { class: 'era-tl' });
    L.forEach(function (e, i) {
      const a = e.from, b = i + 1 < L.length ? L[i + 1].from : y1;
      tl.appendChild(h('div', { class: 'era-seg' + (i === k ? ' cur' : '') + (i < k ? ' past' : ''), style: { flexGrow: String(Math.max(0.6, b - a)), '--sc': col(i) }, 'data-tip': e.name + ' · ' + a + (i + 1 < L.length ? '–' + b : ' 年起') },
        h('i'), h('span', null, e.name)));
    });
    const mk = h('div', { class: 'era-now', style: { left: (U.clamp((t - y0) / (y1 - y0), 0, 1) * 100) + '%' } });
    el.appendChild(h('div', { class: 'era-tlwrap' }, tl, mk, h('div', { class: 'row between tiny muted' }, h('span', null, String(y0)), h('span', null, String(Math.floor(y1))))));
    // 当前阶段：名称、年份、标签与阶段内进度；背景分「史实 / 估算 / 模拟 / 虚构」
    const e = v.era, to = v.to || e.from + 15, frac = U.clamp((t - e.from) / Math.max(0.5, to - e.from), 0, 1);
    const hero = h('div', { class: 'era-hero' },
      h('div', { class: 'row between' }, h('div', null, h('div', { class: 'tiny', style: { opacity: 0.85 } }, '第 ' + (k + 1) + ' / ' + L.length + ' 阶段 · ' + e.from + (v.to ? '–' + v.to : ' 年起')), h('div', { class: 'era-name' }, e.name)), h('span', { class: 'era-tag' }, e.tag)),
      h('div', { class: 'era-bar' }, h('i', { style: { width: Math.round(frac * 100) + '%' } })),
      v.trans ? h('div', { class: 'tiny', style: { opacity: 0.9, marginTop: '6px' } }, v.trans.next ? '正在逐步过渡到「' + v.trans.era.name + '」。' : '上一阶段「' + v.trans.era.name + '」的影响正在逐步减弱。') : null);
    el.appendChild(hero);
    // 背景按「史实 / 估算 / 模拟 / 虚构」分行；英文先整段翻译再按 Historical / Estimated 等标签分行
    const en = CM.I18n && CM.I18n.get() === 'en';
    const src = en ? CM.I18n.text(String(e.summary || '')) : String(e.summary || '');
    const parts = src.split(en ? /(?=(?:Historical|Estimated|Simulated|Fictional): )/ : /(?=(?:史实|估算|模拟|虚构)：)/);
    const TAGCLS = { '史实': 'hist', '模拟': 'sim', 'Historical': 'hist', 'Simulated': 'sim' };
    const bg = h('div', { class: 'era-bg' });
    for (const p of parts) {
      const m = (en ? /^(Historical|Estimated|Simulated|Fictional): / : /^(史实|估算|模拟|虚构)：/).exec(p); if (!m && !p.trim()) continue;
      const body = m ? p.slice(m[0].length) : p;
      bg.appendChild(h('div', { class: 'era-bgrow' }, m ? h('span', { class: 'tag ' + (TAGCLS[m[1]] || 'info') }, m[1]) : null, h('span', null, en ? body.charAt(0).toUpperCase() + body.slice(1) : body)));
    }
    el.appendChild(bg);
    // 本阶段以来的城市变化
    const which = this.eraWhich || 'era', rc = E.regionChange(g, which);
    if (rc) {
      const now = rc.now, b = rc.base, dp = now.pop - b.pop, dj = now.jobs - b.jobs, dkm = now.km - (b.km || 0);
      const tile = function (icon, cls, label, val, sub) { return h('div', { class: 'era-tile' }, h('span', { class: 'badge ' + cls }, CM.icon(icon, 16)), h('div', null, h('small', null, label), h('b', null, val), sub ? h('small', null, sub) : null)); };
      const seg = h('div', { class: 'seg-ctl sm' });
      for (const o of [['era', '本阶段以来'], ['start', '本局以来']]) seg.appendChild(h('button', { class: which === o[0] ? 'on' : '', 'data-silent': '1', onclick: function () { self.eraWhich = o[0]; self.R.layerOpt.devB = o[0]; if (self.layer === 'dev') self.renderDock(); self.R.heatKey = ''; self.rerenderPage(); } }, o[1]));
      el.appendChild(h('div', { class: 'row between era-h' }, h('b', null, '城市变化'), seg));
      el.appendChild(h('div', { class: 'tiny muted' }, '与 ' + b.y + ' 年 ' + b.m + ' 月相比' + (b.joined ? '（旧存档从读档时开始比较）' : '')));
      el.appendChild(h('div', { class: 'era-tiles' },
        tile('people', 'b-green', '人口', U.fmtSigned(Math.round(dp / 1000) / 10, 1) + ' 万', U.fmtPct(b.pop > 0 ? dp / b.pop : 0, 0)),
        tile('briefcase', 'b-blue', '岗位', U.fmtSigned(Math.round(dj / 1000) / 10, 1) + ' 万', U.fmtPct(b.jobs > 0 ? dj / b.jobs : 0, 0)),
        tile('building', 'b-orange', '新开发用地', U.fmtSigned(Math.round(rc.dl * 10) / 10, 1) + ' km²', null),
        tile('metro', 'b-teal', '地铁里程', U.fmtSigned(Math.round(dkm), 0) + ' km', '步行可达 ' + U.fmtPct(now.cov || 0, 0))));
      const mapBtn = function (key, label) { return h('button', { class: 'btn', onclick: function () { self.R.layerOpt.devK = key; self.R.layerOpt.devB = which; self.setLayer('dev'); self.R.heatKey = ''; } }, CM.icon('map', 14), label); };
      el.appendChild(h('div', { class: 'row', style: { gap: '6px', flexWrap: 'wrap', margin: '8px 0 4px' } }, h('span', { class: 'tiny muted' }, '在地图上看：'), mapBtn('pop', '人口'), mapBtn('jobs', '岗位'), mapBtn('land', '用地')));
      // 片区排行：横向条形图（人口 / 岗位 / 用地增加最多的片区）
      const rk = this.eraRank || 'dp', rkSeg = h('div', { class: 'seg-ctl sm' });
      for (const o of [['dp', '人口'], ['dj', '岗位'], ['dl', '用地']]) rkSeg.appendChild(h('button', { class: rk === o[0] ? 'on' : '', 'data-silent': '1', onclick: function () { self.eraRank = o[0]; self.rerenderPage(); } }, o[1]));
      const top = rc.list.filter(function (r) { return Math.abs(r[rk]) > (rk === 'dl' ? 0.01 : 50); }).sort(function (a, c) { return c[rk] - a[rk]; });
      const show = top.slice(0, 5).concat(top.length > 6 && top[top.length - 1][rk] < 0 ? [top[top.length - 1]] : []);
      const mx = show.reduce(function (s, r) { return Math.max(s, Math.abs(r[rk])); }, 0) || 1;
      const bars = h('div', { class: 'era-bars' });
      for (const r of show) {
        const val = r[rk], txt = rk === 'dl' ? U.fmtSigned(Math.round(val * 10) / 10, 1) + ' km²' : U.fmtSigned(Math.round(val / 100) / 100, 2) + ' 万';
        bars.appendChild(h('button', { class: 'era-barrow clickable', onclick: function () { self.locateRegion(r.k); } },
          h('span', { class: 'nm' }, r.name), h('span', { class: 'br' }, h('i', { class: val < 0 ? 'neg' : '', style: { width: Math.max(3, Math.abs(val) / mx * 100) + '%' } })), h('span', { class: 'vl' }, txt)));
      }
      el.appendChild(h('div', { class: 'row between era-h' }, h('b', null, '变化最多的片区'), rkSeg));
      el.appendChild(show.length ? bars : h('div', { class: 'note muted' }, '还没有明显变化。'));
    }
    // 发展倾向、走廊与背景交通（标签形式）
    const chips = function (label, list, cls) { if (!list || !list.length) return null; return h('div', { class: 'era-chips' }, h('small', null, label), list.map(function (x) { return h('span', { class: 'chip ' + cls }, x); })); };
    const trend = h('div', { class: 'era-trend' },
      chips('人口增长较快', v.popUp, 'up'), chips('岗位增长较快', v.jobUp, 'up'), chips('增长放缓', v.popDown.concat(v.jobDown.filter(function (x) { return v.popDown.indexOf(x) < 0; })), 'down'),
      chips('主要出行走廊', v.corr, 'corr'),
      Math.abs(v.decayHW - 1) > 0.03 ? chips('通勤距离', [v.decayHW > 1 ? '偏长（郊区化）' : '偏短（职住较近）'], 'corr') : null,
      v.bg ? chips('背景交通', [v.bg.name + ' · 约占非地铁出行 ' + U.fmtPct(v.bg.share, 0)], 'bgt') : null);
    if (trend.childNodes.length) el.append(h('div', { class: 'era-h' }, h('b', null, '本阶段的发展倾向')), trend);
    const mix = UI.modeMix(g); if (mix) el.append(h('div', { class: 'era-h' }, h('b', null, '地铁以外的出行结构')), mix);
    if (v.fx.length) {
      el.appendChild(h('div', { class: 'era-h' }, h('b', null, '生效中的事件影响')));
      for (const x of v.fx) el.appendChild(h('div', { class: 'era-fx' }, CM.icon('sparkle', 15), h('div', null, h('b', null, x.title), h('small', null, x.note))));
    }
    if (v.goals.length) {
      el.appendChild(h('div', { class: 'era-h' }, h('b', null, '阶段目标'), h('small', { class: 'muted' }, '在本阶段内作为本城任务发布')));
      const ST = { '进行中': 'run', '已完成': 'ok', '未完成': 'bad', '已发布': 'run', '待发布': 'wait' };
      for (const x of v.goals) el.appendChild(h('div', { class: 'era-goal ' + (ST[x.state] || '') }, CM.icon('flag', 15), h('span', { class: 'grow' }, x.title.replace(/^阶段目标：/, '')), h('span', { class: 'st' }, x.state)));
    }
    if (v.log.length) el.appendChild(this.sec('era-past', '往期阶段', String(v.log.length), function () {
      const box = h('div');
      for (const r of v.log.slice().reverse()) {
        const Ei = E.byId(r.id), i = L.indexOf(Ei);
        box.appendChild(h('div', { class: 'era-past', style: { '--sc': col(Math.max(0, i)) } }, h('div', { class: 'row' }, h('i'), h('b', null, Ei ? Ei.name : r.id), h('span', { class: 'muted small' }, r.start.y + '–' + r.end.y)), h('div', { class: 'note' }, r.text)));
      }
      return box;
    }));
    el.appendChild(h('div', { class: 'note muted small', style: { marginTop: '10px' } }, '只改变增长的去向，总量仍按人口曲线。'));
    return { title: '发展阶段', el: el };
  };
  // 数据来源与真实性：由各地图的场景数据提供（[标签, 样式, 说明]），没有时给出通用说明
  UI.prototype.dataNote = function () {
    let rows = (D.dataNote || [['模拟', 'sim', '城市与交通数据为游戏模拟结果。']]).slice();
    // 交通模型（v1.9）：设施、出行目的与工作日/周末的资料来源，插在末尾的免责说明之前
    const tm = D.fictional ? [['交通模型', 'info', '重要设施的位置、年份与规模为游戏设定；出行分为通勤、上学、购物、医疗、旅游休闲与枢纽接驳，工作日与周末分别模拟（比例与倍数为估算）。']] :
      [['设施（史实）', 'hist', '重要设施的位置与启用年份、双休日实行年份（位置为近似）。'],
        ['设施（估算）', 'est', '设施规模、出行目的构成、周末与各时段的出行分布。'],
        ['设施（模拟）', 'sim', '到访量、乘地铁比例、客流与票款；普通铁路与航班不模拟。']];
    const tail = rows.length && !rows[rows.length - 1][0] ? rows.pop() : null;
    rows = rows.concat(tm); if (tail) rows.push(tail);
    return h('div', { class: 'note' }, rows.map(function (r, i) {
      return h('div', { style: { marginTop: i ? '6px' : '0' } }, r[0] ? h('span', { class: 'tag ' + (r[1] || '') }, r[0]) : null, (r[0] ? ' ' : '') + r[2]);
    }));
  };
  // ======================== 页面：财政与经济 ========================
  // 分页：概览（资金、本月收支、经济摘要、下月拨款、票价）· 经济（GDP、增长来源、交通影响、经济事件、历年数据）·
  // 财政（地方财政收入、拨款依据、收支明细、流水、失败条件）· 融资（利率报价、发债、债务与偿债预测）
  const pctS = function (x, d) { return x == null || !isFinite(x) ? '—' : (x > 0 ? '+' : (x < 0 ? '−' : '±')) + Math.abs(x * 100).toFixed(d == null ? 1 : d) + '%'; };
  const ppS = function (x, d) { return x == null || !isFinite(x) ? '—' : (x > 0 ? '+' : (x < 0 ? '−' : '±')) + Math.abs(x * 100).toFixed(d == null ? 2 : d) + ' 个百分点'; };
  UI.pctS = pctS;
  // 金额（含万亿）：内部单位为「万 + 本城货币」
  UI.fmtBig = function (wan) {
    if (!isFinite(wan)) return '—';
    const mo = CFG.money, a = Math.abs(U.cur(wan));
    if (a >= 1e8) return (wan < 0 ? '−' : '') + (a / 1e8).toFixed(a >= 1e9 ? 1 : 2) + ' 万' + mo.yi;
    return U.fmtMoney(wan, a >= 1e6 ? 0 : 1);
  };
  UI.prototype.pageTabs = function (tabs, cur, onPick) {
    const bar = h('div', { class: 'ptabs', role: 'tablist' });
    for (const t of tabs) bar.appendChild(h('button', { class: t[0] === cur ? 'on' : '', role: 'tab', 'aria-selected': t[0] === cur ? 'true' : 'false', 'data-silent': '1', onclick: function () { if (t[0] !== cur) { snd2('soft'); onPick(t[0]); } } }, CM.icon(t[2], 15), h('span', null, t[1])));
    return bar;
  };
  const snd2 = function (n) { if (CM.Sound) CM.Sound.play(n); };
  // 顶栏「资金」打开的右侧面板：收支、经济、财政、融资（v2.7：票价单独在地铁芯的「票价管理」调，收支页有入口）
  UI.prototype.page_finance = function (id) {
    const g = this.g(), E = g.econ, self = this, free = E.isFree();
    const mv = CM.Macro && g.macro ? CM.Macro.view(g) : null;
    const tabs = [['ov', '收支', 'chart']];
    if (mv) tabs.push(['econ', '经济', 'trend']);
    tabs.push(['fisc', '财政', 'bank']);
    if (!free && E.canBorrow()) tabs.push(['debt', '融资', 'wallet']);
    let tab = id || this.finTab || 'ov';
    if (!tabs.some(function (t) { return t[0] === tab; })) tab = 'ov';
    this.finTab = tab;
    const el = h('div', { class: 'fin-page' });
    el.appendChild(this.pageTabs(tabs, tab, function (t) {
      self.finTab = t;
      const top = self.stack[self.stack.length - 1]; if (top && top.kind === 'finance') top.id = t;
      self.renderPage(false); self.rBody.scrollTop = 0;
    }));
    const body = h('div', { class: 'fin-body page-enter' });
    el.appendChild(body);
    if (tab === 'econ') this.finEcon(body, mv);
    else if (tab === 'fisc') this.finFiscal(body, mv);
    else if (tab === 'debt') this.finDebt(body);
    else this.finOverview(body, mv);
    if (g.macroError) body.appendChild(this.callout('warn', 'warn', g.macroError));
    return { title: '财政与经济', el: el };
  };
  const goFin = function (self, t) {
    const go = function () { self.finTab = t; self.openPage('finance', t, { replaceTop: self.topIs(['finance']), root: !self.topIs(['finance']) }); };
    if (self.opsApp) self.opsApp.close(go); else go();
  };

  // ---------- 概览 ----------
  UI.prototype.finOverview = function (el, mv) {
    const g = this.g(), E = g.econ, self = this, free = E.isFree(), EPS = CM.Economy.MONEY_EPS;
    // 资金：一般资金 / 专项 / 债务（自由建造为不限）
    if (free) el.appendChild(h('div', { class: 'fin-free' }, h('span', { class: 'badge b-teal' }, CM.icon('sparkle')), h('div', null, h('b', null, '自由建造 · 资金不限'), h('small', null, '建设不受资金限制，没有拨款、债务与经营失败；票款、运营成本与城市经济照常计算，供参考。'))));
    else {
      const grid = h('div', { class: 'fin-cards' });
      const sF = this.stat('一般资金', '—', '', '', 'coin'), sC = this.stat('建设专项资金', '—', '', '', 'hammer'), sD = this.stat('债务余额', '—', '', '', 'wallet');
      grid.append(sF, sC, sD);
      el.appendChild(grid);
      const upd = function () {
        sF.setV(U.fmtMoney(E.funds), E.funds < 0 ? '负余额' : '运营、利息与还本', E.funds < 0 ? 'bad' : 'muted');
        sC.setV(U.fmtMoney(E.capex), '只能用于建设');
        const live = E.bonds.filter(function (b) { return !b.done; }).length;
        sD.setV(U.fmtMoney(E.debtTotal()), E.overdue > EPS ? '含逾期 ' + U.fmtMoney(E.overdue) : (live ? live + ' 笔未到期' : '暂无债务'), E.overdue > EPS ? 'bad' : 'muted');
      };
      upd(); this.live.push(upd);
      for (const w of E.warnings()) el.appendChild(this.callout(w.level === 'danger' ? 'bad' : 'warn', 'warn', w.text));
      if (E.overdue > EPS) el.appendChild(this.callout('bad', 'warn', '存在逾期债务 ' + U.fmtMoney(E.overdue) + '（已 ' + E.overdueMonths + ' 个月）：每月收取逾期费用，' + (E.overdueMonths >= 6 ? '已暂停全部债券发行' : '城投债已暂停发行') + '。一般资金有余额时会自动偿还。'));
    }
    // 本月收支：一行一项，收入绿色、支出橙色
    const mbox = h('div', { class: 'fin-month' });
    const row = function (icon, label, v, cls) { return h('div', { class: 'fm-row ' + cls }, CM.icon(icon, 15), h('span', { class: 'grow' }, label), h('b', { class: 'num' }, v)); };
    const drawMonth = function () {
      const c = E.cur;
      // 原生 replaceChildren 会把 null 写成文字，只传实际存在的节点
      mbox.replaceChildren.apply(mbox, [
        h('div', { class: 'fm-h' }, h('b', null, '本月收支'), h('span', { class: 'tiny muted' }, g.clock.y + '年' + g.clock.m + '月 · 已结算 ' + c.days + ' 天')),
        free ? null : row('bank', '政府拨款', '+' + U.fmtMoney(c.grant), 'in'),
        row('ticket', '票款', '+' + U.fmtMoney(c.fare), 'in'),
        c.crossFee > 0.05 ? row('bridge', '其中跨境附加费', U.fmtMoney(c.crossFee), 'in') : null,
        c.commerce > 0.05 ? row('bag', '车站商业（广告与租金）', '+' + U.fmtMoney(c.commerce), 'in') : null,
        free || !c.ppp ? null : row('briefcase', '政府合同（补助、付费与退还保证金）', '+' + U.fmtMoney(c.ppp), 'in'),
        free || !c.reward ? null : row('gift', '任务奖励', '+' + U.fmtMoney(c.reward), 'in'),
        free || !c.fleetSale ? null : row('train', '出售列车（残值）', '+' + U.fmtMoney(c.fleetSale), 'in'),
        row('train', '运营成本', '−' + U.fmtMoney(c.ops), 'out'),
        c.todCost > 0.05 ? row('bag', '车站商业成本', '−' + U.fmtMoney(c.todCost), 'out') : null,
        free || !c.pppOut ? null : row('briefcase', '合同支出（保证金、分成、违约）', '−' + U.fmtMoney(c.pppOut), 'out'),
        (function () { let b = 0; for (const k of CM.Economy.BUILD_KINDS) b += c[k] || 0; return b > 0.5 ? row('hammer', '建设支出', '−' + U.fmtMoney(b), 'out') : null; })(),
        free || !((c.interest || 0) + (c.principal || 0) + (c.penalty || 0)) ? null : row('wallet', '偿债', '−' + U.fmtMoney((c.interest || 0) + (c.principal || 0) + (c.penalty || 0)), 'debt'),
        h('button', { class: 'linkbtn', onclick: function () { goFin(self, 'fisc'); } }, '收支明细与资金流水', CM.icon('chev', 14))].filter(Boolean));
    };
    drawMonth(); mbox._d = E.cur.days; this.live.push(function () { if (E.cur.days !== mbox._d) { mbox._d = E.cur.days; drawMonth(); } });
    el.appendChild(mbox);
    // 城市经济摘要
    if (mv) el.appendChild(this.econCard(mv, function () { goFin(self, 'econ'); }));
    // 下月拨款（经营挑战）
    if (!free) {
      const ny = g.clock.m === 12 ? g.clock.y + 1 : g.clock.y, nm = g.clock.m % 12 + 1;
      el.appendChild(h('div', { class: 'fin-grant clickable', onclick: function () { goFin(self, 'fisc'); } },
        h('div', { class: 'fg-h' }, CM.icon('bank', 16), h('b', null, '下月拨款预计'), h('span', { class: 'grow' }), h('b', { class: 'num' }, U.fmtMoney(E.grantFor(ny, nm))), CM.icon('chev', 14)),
        this.grantChain(ny, nm, true)));
    }
    // 后期经营提示（v2.3 平衡）：运营费用随物价上涨而票价长期不变时，票款覆盖率会越来越低
    if (!free) {
      const L12 = E.ledger.slice(-12), ops = L12.reduce(function (a, r) { return a + (r.ops || 0); }, 0), inc = L12.reduce(function (a, r) { return a + (r.fare || 0) + (r.commerce || 0) - (r.todCost || 0); }, 0);
      if (L12.length >= 6 && ops > 0 && inc / ops < 0.35 && g.compiled.stations.length >= 20)
        el.appendChild(this.callout('warn', 'coin', '近一年票款与车站商业收入只覆盖运营费用的 ' + U.fmtPct(inc / ops, 0) + '。可以适度提高票价，或开发高客流车站的商业空间。'));
    }
    // 票价（v2.7）：在地铁芯的「票价管理」调整，这里显示现行票价并直达
    el.appendChild(h('div', { class: 'fin-grant clickable fin-fare', onclick: function () { self.openOpsApp('fare'); } },
      h('div', { class: 'fg-h' }, CM.icon('ticket', 16), h('b', null, '票价'), h('span', { class: 'grow' }), h('span', { class: 'tiny muted' }, UI.fareText(E.fare)), CM.icon('chev', 14)),
      h('div', { class: 'tiny muted' }, '在地铁芯的「票价管理」调整')));
    // 车站商业（TOD，v2.3）：已开发车站的月收入，以及客流最高、还能开发或升级的车站——点按钮直接打开商业开发气泡
    const C = g.model.net ? g.model.net.C : null, sd = g.model.stDaily;
    if (CM.TOD && C && sd && !g.model.dailyStale) {
      const T = CM.TOD, rows = [];
      C.stations.forEach(function (s, k) {
        const st = g.net.stations[s.id]; if (!st || !C.serviced[k] || k >= sd.inn.length) return;
        const flow = sd.inn[k] + sd.out[k] + sd.xfer[k], hub = C.stationLines[k].size >= 2, lv = st.tod || 0;
        rows.push({ id: s.id, name: st.name, lv: lv, flow: flow, hub: hub, month: (T.stationDaily(lv, flow, hub, g.clock.y, g) - T.stationCost(lv, g.clock.y, st.size, hub)) * 30.4 });
      });
      rows.sort(function (a, b) { return b.flow - a.flow; });
      const dev = rows.filter(function (r) { return r.lv; }), sum = dev.reduce(function (a, r) { return a + r.month; }, 0), loss = dev.filter(function (r) { return r.month < 0; });
      el.appendChild(this.sec('fi-tod', '车站商业（TOD）', dev.length ? dev.length + ' 站 · 每月净' + (sum < 0 ? '亏 ' : '收 ') + U.fmtMoney(Math.abs(sum)) : '尚未开发', function () {
        const b = h('div');
        b.appendChild(h('div', { class: 'note' }, '高客流车站可以开发商业，换乘枢纽收益最高；开发后每年有运营与维护成本，客流太少会亏损。'));
        for (const r of loss.slice(0, 4)) b.appendChild(h('div', { class: 'tod-row' },
          h('span', { class: 'grow' }, h('b', null, r.name), h('small', { class: 'bad' }, T.LEVELS[r.lv].name + ' · 每月净亏约 ' + U.fmtMoney(-r.month) + ' · 日客流 ' + U.fmtPeople(r.flow) + ' 人次')),
          h('button', { class: 'btn sm ghost', onclick: function (e) { CM.Quick.popTod(r.id, e.currentTarget); } }, '查看')));
        for (const r of rows.filter(function (x) { return x.lv < 3; }).slice(0, 6)) b.appendChild(h('div', { class: 'tod-row' },
          h('span', { class: 'grow' }, h('b', null, r.name), h('small', null, '日客流 ' + U.fmtPeople(r.flow) + ' 人次' + (r.hub ? ' · 换乘站' : '') + (r.lv ? ' · ' + T.LEVELS[r.lv].name : ''))),
          h('button', { class: 'btn sm' + (r.lv ? '' : ' primary'), onclick: function (e) { CM.Quick.popTod(r.id, e.currentTarget); } }, r.lv ? '升级' : '开发')));
        return b;
      }, false, 'bag'));
    }
  };
  // 经济摘要卡：最近一年的 GDP 与增速、经济环境、交通对经济的影响
  UI.prototype.econCard = function (mv, onOpen) {
    const L = mv.last, fc = mv.fc;
    const val = L ? UI.fmtBig(L.nom) : UI.fmtBig(fc.nom);
    const sub = L ? L.y + ' 年地图范围 GDP' + (L.part ? '（接入当年，' + L.n + ' 个月）' : '') : fc.y + ' 年地图范围 GDP（预测）';
    const gr = L && L.growth != null ? L.growth : fc.growth;
    return h('div', { class: 'econ-card' + (onOpen ? ' clickable' : ''), onclick: onOpen || null },
      h('div', { class: 'ec-top' }, h('span', { class: 'badge b-violet' }, CM.icon('trend')), h('div', { class: 'grow' }, h('small', null, sub), h('b', { class: 'num' }, val)),
        h('span', { class: 'env-chip ' + mv.env.cls }, CM.icon('pulse', 13), mv.env.label), onOpen ? CM.icon('chev', 14) : null),
      h('div', { class: 'ec-row' },
        h('div', null, h('small', null, L && L.growth != null ? '实际增长' : fc.y + ' 年预测增长'), h('b', { class: gr == null ? 'muted' : (gr >= 0 ? 'good' : 'bad') }, pctS(gr))),
        h('div', null, h('small', null, '价格涨幅'), h('b', null, pctS(L ? L.infl : fc.infl))),
        h('div', null, h('small', null, '交通对经济'), h('b', { class: mv.te.eff >= 1 ? 'good' : 'bad' }, pctS(mv.te.eff - 1)))),
      mv.shocks.length ? h('div', { class: 'ec-shock' }, CM.icon('bolt', 13), h('span', null, mv.shocks.slice(0, 2).map(function (s) { return s.ev.title.replace(/^模拟：/, ''); }).join('、') + (mv.shocks.length > 2 ? ' 等 ' + mv.shocks.length + ' 项' : '') + ' 正在影响经济')) : null);
  };
  // 拨款依据：基础额度 × 财力系数 × 满意度系数 × 任务修正 = 拨款
  UI.prototype.grantChain = function (y, m, compact) {
    const E = this.g().econ;
    const box = h('div', { class: 'gchain' + (compact ? ' compact' : '') });
    const step = function (label, v, cls) { box.appendChild(h('div', { class: 'gc-step ' + (cls || '') }, h('small', null, label), h('b', { class: 'num' }, v))); };
    step('基础额度', U.fmtMoney(E.grantQuota(y, m)));
    for (const f of E.grantFactors(y, m)) step(f.kind === 'fisc' ? '财力' : (f.kind === 'sat' ? '满意度' : (f.kind === 'corp' ? '信誉' : '任务')), '×' + f.f.toFixed(2), f.f >= 1.005 ? 'up' : (f.f <= 0.995 ? 'down' : ''));
    return box;
  };

  // ---------- 经济 ----------
  UI.prototype.finEcon = function (el, mv) {
    const g = this.g(), self = this, c = mv.cfg, st = mv.st, L = mv.last, fc = mv.fc, base = CFG.econBase || CFG.START.y;
    el.appendChild(this.econCard(mv, null));
    if (g.macroNote) el.appendChild(this.callout('info', 'info', g.macroNote));
    // 经济环境与外部形势
    el.appendChild(h('div', { class: 'econ-env' },
      h('div', null, h('small', null, '经济环境'), h('b', { class: mv.env.cls }, mv.env.label), h('span', { class: 'tiny muted' }, '本年较上年 ' + pctS(mv.mom))),
      h('div', null, h('small', null, '增长阶段'), h('b', null, mv.trendLabel), h('span', { class: 'tiny muted' }, '生产率趋势 ' + pctS(mv.trend))),
      h('div', null, h('small', null, mv.sim ? '模拟周期' : '资料范围'), h('b', null, mv.sim ? '已进入' : '至 ' + mv.histEnd + ' 年'), h('span', { class: 'tiny muted' }, mv.sim ? '按存档生成，非史实' : '之后为模拟周期'))));
    // 本年预测
    el.appendChild(h('div', { class: 'econ-fc' }, h('span', { class: 'tag fc' }, '预测'),
      h('span', { class: 'grow small' }, fc.y + ' 年 GDP 约 ' + UI.fmtBig(fc.nom) + (fc.growth != null ? '，实际增长约 ' + pctS(fc.growth) : '') + '（已过 ' + fc.months + ' 个月；不含尚未发生的事件）')));
    // 增长来源
    if (L && L.c) {
      el.appendChild(this.sec('ec-src', '增长来源（' + L.y + ' 年）', '实际 ' + pctS(L.growth), function () {
        const list = [['people', '就业岗位', L.c.jobs, '地图内就业变化（已扣除周期波动）'], ['factory', '生产率趋势', L.c.prod, '本城所处发展阶段的趋势增长'], ['metro', '交通效率', L.c.te, '通勤、拥堵与地铁可达性的变化'], ['pulse', '经济周期', L.c.cyc, '景气波动'], ['bolt', '经济事件', L.c.shock, '历史或模拟事件的冲击与恢复']];
        let mx = 0.005; for (const x of list) mx = Math.max(mx, Math.abs(x[2]));
        const box = h('div', { class: 'dbars' });
        for (const x of list) {
          const w = Math.min(50, Math.abs(x[2]) / mx * 50);
          box.appendChild(h('div', { class: 'dbar', 'data-tip': x[3] }, h('span', { class: 'dl' }, CM.icon(x[0], 14), x[1]),
            h('span', { class: 'dt' }, h('i', { class: x[2] >= 0 ? 'pos' : 'neg', style: { width: w + '%', left: x[2] >= 0 ? '50%' : (50 - w) + '%' } })),
            h('b', { class: 'num ' + (x[2] >= 0 ? 'good' : 'bad') }, pctS(x[2]))));
        }
        box.appendChild(h('div', { class: 'note', style: { marginTop: '6px' } }, '各项相乘得到实际增长（价格变化不计入实际增长）。名义 GDP 增长 ' + pctS(L.nomGrowth) + '，其中价格涨幅 ' + pctS(L.infl) + '。'));
        return box;
      }, true, 'chart'));
    }
    // 交通与经济
    el.appendChild(this.sec('ec-te', '交通对经济的影响', pctS(mv.te.eff - 1), function () {
      const p = mv.te.parts, s = mv.te.sample, b = mv.te.base;
      const box = h('div');
      box.appendChild(self.kv([
        ['可达性（覆盖与地铁分担）', pctS(p.acc, 2), p.acc >= 0 ? 'good' : 'bad'],
        ['平均通勤时间' + (s && b.comm ? '（' + U.fmtNum(b.comm, 1) + ' → ' + U.fmtNum(s.comm, 1) + ' 分钟）' : ''), pctS(p.comm, 2), p.comm >= 0 ? 'good' : 'bad'],
        ['道路拥堵' + (s ? '（' + b.cong.toFixed(2) + ' → ' + s.cong.toFixed(2) + '）' : ''), pctS(p.cong, 2), p.cong >= 0 ? 'good' : 'bad'],
        ['当前交通效率', pctS(mv.te.now - 1, 2), mv.te.now >= 1 ? 'good' : 'bad'],
        ['已计入 GDP 的效率', pctS(mv.te.eff - 1, 2), mv.te.eff >= 1 ? 'good' : 'bad'],
      ]));
      box.appendChild(h('div', { class: 'note', style: { marginTop: '6px' } }, '与' + (st.origin === 'legacy' ? '接入时（' + st.since[0] + '年' + st.since[1] + '月）' : '开局时') + '相比。交通改善按地铁分担率的提高计入生产率（约 −6% 至 +8%），不能抵消外部危机。'));
      return box;
    }, false, 'metro'));
    // 经济事件
    el.appendChild(this.sec('ec-ev', '经济事件', mv.shocks.length ? mv.shocks.length + ' 项影响中' : '暂无', function () {
      const box = h('div');
      if (!mv.shocks.length) box.appendChild(h('div', { class: 'note' }, '目前没有正在影响本城经济的事件。' + (mv.sim ? '模拟阶段偶尔会出现模拟的景气或衰退事件。' : '历史经济事件按真实年月发生。')));
      for (const x of mv.shocks) {
        const ev = x.ev, f = x.f, neg = Math.min.apply(null, ev.lv) < 0;
        box.appendChild(h('div', { class: 'ev-card ' + (neg ? 'neg' : 'pos') },
          h('div', { class: 'row' }, h('span', { class: 'tag ' + (ev.tag === '模拟' ? 'sim' : 'hist') }, ev.tag === '模拟' ? '模拟' : '史实'), h('span', { class: 'tag' }, ev.scope || CM.Macro.kindName(ev.kind)), h('b', { class: 'grow' }, ev.title.replace(/^模拟：/, '')), h('span', { class: 'tiny muted' }, ev.y + '.' + ev.m)),
          h('div', { class: 'small', style: { margin: '4px 0' } }, ev.desc),
          h('div', { class: 'ev-fx' }, h('span', null, '今年 ', h('b', { class: x.now >= 0 ? 'good' : 'bad' }, pctS(x.now))), h('span', null, '明年 ', h('b', { class: x.next >= 0 ? 'good' : 'bad' }, pctS(x.next))),
            h('span', { class: 'tiny muted' }, f.pre ? '接入前已发生' : '强度 ×' + f.k.toFixed(2) + '（结构 ×' + f.sm.toFixed(2) + (f.scale !== 1 ? ' · 本地 ×' + f.scale.toFixed(2) : '') + (f.resil ? ' · 交通韧性 −' + Math.round(f.resil * 20) + '%' : '') + (f.stress ? ' · 财政压力 +' + Math.round(f.stress * 25) + '%' : '') + '）'))));
      }
      box.appendChild(h('div', { class: 'note', style: { marginTop: '6px' } }, '影响按本城产业结构计算；交通好、财政稳的城市受冲击较小。'));
      return box;
    }, mv.shocks.length > 0, 'bolt'));
    // 城市发展的反应
    if (mv.factors) {
      const F = mv.factors;
      el.appendChild(this.sec('ec-city', '对城市发展的影响', F.dev >= 0.005 ? '促进' : (F.dev <= -0.005 ? '放缓' : '中性'), function () {
        return h('div', null, self.kv([['人口增速', '×' + F.popGrowth.toFixed(2), F.popGrowth >= 1 ? 'good' : 'bad'], ['就业岗位水平', '×' + F.jobs.toFixed(3), F.jobs >= 1 ? 'good' : 'bad'], ['商业办公发展', '×' + F.com.toFixed(2), F.com >= 1 ? 'good' : 'bad']]),
          h('div', { class: 'note', style: { marginTop: '6px' } }, '繁荣时增长加快、新区可提前开放；衰退时增长放缓。'));
      }, false, 'building'));
    }
    // 历年数据
    el.appendChild(this.sec('ec-table', '历年数据', st.rec.length + ' 年', function () {
      const ref = c.ref;
      const t = h('table', { class: 'tbl econ-tbl' }, h('tr', null, h('th', null, '年份'), h('th', null, 'GDP'), h('th', null, '实际增长'), h('th', null, '价格'), ref ? h('th', null, '参考') : null));
      const refCell = function (Y) { const r = CM.Macro.refAt(c, Y); if (!r) return h('td', { class: 'muted' }, '—'); return h('td', { class: 'ref', 'data-tip': ref.label + (r.kind === 'period' ? '（' + r.from + '–' + r.to + ' 年平均）' : '') }, (r.kind === 'year' ? '' : '≈') + (r.v * 100).toFixed(1) + '%'); };
      t.appendChild(h('tr', { class: 'fc' }, h('td', null, fc.y, h('span', { class: 'tag fc' }, '预测')), h('td', null, UI.fmtBig(fc.nom)), h('td', null, pctS(fc.growth)), h('td', null, pctS(fc.infl)), ref ? refCell(fc.y) : null));
      for (const r of st.rec.slice().reverse()) {
        t.appendChild(h('tr', null, h('td', null, r.y, r.part ? h('span', { class: 'tag' }, r.n + ' 月') : null, r.sim ? h('span', { class: 'tag sim' }, '模拟') : null), h('td', null, UI.fmtBig(r.nom)), h('td', { class: r.growth == null ? 'muted' : (r.growth >= 0 ? '' : 'bad') }, pctS(r.growth)), h('td', null, pctS(r.infl)), ref ? refCell(r.y) : null));
      }
      const box = h('div', null, h('div', { class: 'tbl-wrap' }, t));
      if (!st.rec.length) box.appendChild(h('div', { class: 'note' }, '第一个完整年度在明年 1 月结算后显示。'));
      box.appendChild(h('div', { class: 'row', style: { marginTop: '8px' } }, h('button', { class: 'btn sm', onclick: function () { self.openStats('econ'); } }, CM.icon('chart', 15), '查看经济图表')));
      return box;
    }, true, 'calYear'));
    // 数据说明
    el.appendChild(this.sec('ec-note', '数据口径与来源', '', function () {
      const rows = [
        ['游戏结果', '', '每年 1 月结算的地图范围 GDP（实际增长按 ' + base + ' 年价格）。'],
        ['预测', 'fc', '当年尚未结束时的估算，只包含已经发生的事件。'],
        ['模型估算', 'est', '开局 GDP、生产率趋势、价格涨幅与财政比重为参考公开统计的估算参数。' + (c.area ? '统计范围：' + c.area + '。' : '') + (c.note || '')],
        ['史实参考', 'hist', ref() ],
        ['模拟', 'sim', mv.histEnd + ' 年之后的经济周期与模拟事件由存档种子生成，不代表真实历史或预测。'],
      ];
      function ref() { return c.ref ? c.ref.label + '：' + c.ref.src + '。为全国或地区口径，不是地图范围数据，只作背景对照。' : '本地图没有可用的史实参考数据。'; }
      const box = h('div', { class: 'note' });
      rows.forEach(function (r, i) { box.appendChild(h('div', { style: { marginTop: i ? '6px' : '0' } }, h('span', { class: 'tag ' + r[1] }, r[0]), ' ' + r[2])); });
      if (st.origin === 'legacy') box.appendChild(h('div', { style: { marginTop: '6px' } }, '本进度自 ' + st.since[0] + '年' + st.since[1] + '月 起接入城市经济，此前的经济数据没有记录，也不补造。'));
      return box;
    }, false, 'info'));
  };

  // ---------- 财政 ----------
  UI.prototype.finFiscal = function (el, mv) {
    const g = this.g(), E = g.econ, self = this, free = E.isFree();
    const L = mv && mv.last;
    if (mv) {
      const F = mv.fisc || {};
      const rr = L ? L.rev / Math.max(1, L.nom) : null;
      const card = h('div', { class: 'fisc-card' },
        h('div', { class: 'ec-top' }, h('span', { class: 'badge b-gold' }, CM.icon('bank')), h('div', { class: 'grow' }, h('small', null, L ? L.y + ' 年地方财政收入（地图范围）' : '地方财政收入'), h('b', { class: 'num' }, L ? UI.fmtBig(L.rev) : '待结算')),
          L ? h('span', { class: 'env-chip ' + (L.fRaw >= 1 ? 'good' : 'warn') }, '为预期的 ' + Math.round(L.fRaw * 100) + '%') : null),
        h('div', { class: 'ec-row' },
          h('div', null, h('small', null, '占 GDP'), h('b', null, rr ? (rr * 100).toFixed(1) + '%' : '—')),
          h('div', null, h('small', null, (F.y || g.clock.y) + ' 年财力系数'), h('b', { class: (F.f || 1) >= 1 ? 'good' : 'warn' }, '×' + (F.f || 1).toFixed(2))),
          h('div', null, h('small', null, '地铁资金占比'), h('b', null, !free && L ? ((E.grantQuota(g.clock.y, g.clock.m) * (F.f || 1) * 12) / Math.max(1, L.rev) * 100).toFixed(1) + '%' : '—'))));
      el.appendChild(card);
      el.appendChild(h('div', { class: 'note', style: { margin: '4px 2px 8px' } }, '财力系数：每年 1 月按上一年实际与预期财政收入之比确定（×0.70–1.30）。' + (L ? '' : '第一个完整年度结算后开始生效。')));
    }
    if (!free) {
      const ny = g.clock.m === 12 ? g.clock.y + 1 : g.clock.y, nm = g.clock.m % 12 + 1;
      el.appendChild(this.sec('fi-grant', '地铁拨款依据', '下月 ' + U.fmtMoney(E.grantFor(ny, nm)), function () {
        const b = h('div');
        b.appendChild(self.grantChain(ny, nm, false));
        b.appendChild(h('div', { class: 'chg small', style: { marginTop: '6px' } }, h('b', null, '下月（' + ny + '年' + nm + '月）拨款'), h('b', { class: 'num' }, U.fmtMoney(E.grantFor(ny, nm)))));
        for (const f of E.grantFactors(ny, nm)) if (f.kind === 'task') b.appendChild(h('div', { class: 'tiny muted' }, '· ' + f.label + ' ×' + f.f.toFixed(2)));
        b.appendChild(h('div', { class: 'note', style: { marginTop: '6px' } }, '拨款 = 基础额度 × 财力系数 × 满意度系数（×0.6–1.4）× 任务修正，每月初发放。'));
        return b;
      }, true, 'bank'));
    }
    el.appendChild(this.sec('fi-month', '收支明细', g.clock.y + '年' + g.clock.m + '月', function () { return self.ledgerBlock(); }, free, 'coin'));
    if (!free) el.appendChild(this.sec('fi-flow', '资金流水', '最近 ' + Math.min(40, E.flow.length) + ' 笔', function () { return self.flowBlock(); }, false, 'tasks'));
    if (!free) {
      el.appendChild(this.sec('fi-rule', '经营失败条件', E.negMonths || E.lowSatMonths ? '有预警' : '正常', function () {
        const b = h('div');
        const lim = CFG.economy.debtLimit * E.costIndex(g.clock.y);
        b.appendChild(self.kv([['连续负余额', E.negMonths + ' / ' + CFG.economy.negMonthsLimit + ' 个月', E.negMonths ? 'warn' : ''], ['负债下限', U.fmtMoney(lim)], ['满意度低于 ' + CFG.economy.satFail, E.lowSatMonths + ' / ' + CFG.economy.satFailMonths + ' 个月', E.lowSatMonths ? 'warn' : '']]));
        b.appendChild(h('div', { class: 'note', style: { marginTop: '6px' } }, '长期负余额、低于负债下限或满意度长期过低会导致挑战失败。'));
        return b;
      }, false, 'info'));
    }
  };

  // ---------- 融资 ----------
  UI.prototype.finDebt = function (el) {
    const g = this.g(), E = g.econ, self = this, y = g.clock.y, D0 = CM.Economy.BOND_DEF;
    // 利率报价
    const q = h('div', { class: 'quote-card' });
    q.appendChild(h('div', { class: 'fg-h' }, CM.icon('percent', 16), h('b', null, '新发行利率报价'), h('span', { class: 'grow' }), h('span', { class: 'tiny muted' }, y + '年' + g.clock.m + '月')));
    const grid = h('div', { class: 'quote-grid' });
    grid.appendChild(h('div', { class: 'qh' }));
    grid.append(h('div', { class: 'qh' }, '3 年期'), h('div', { class: 'qh' }, '6 年期'));
    for (const k of ['local', 'ct']) {
      const block = E.bondBlock(k);
      grid.append(h('div', { class: 'qk' }, D0[k].name), h('div', { class: 'qv' + (block ? ' off' : '') }, (E.bondRate(k, y, 3) * 100).toFixed(2) + '%'), h('div', { class: 'qv' + (block ? ' off' : '') }, (E.bondRate(k, y, 6) * 100).toFixed(2) + '%'));
    }
    q.appendChild(grid);
    const parts = E.bondQuote('local', y, 3).parts;
    const pl = h('div', { class: 'qparts' });
    for (const p of parts) pl.appendChild(h('div', { class: 'chg small' }, h('span', null, p.label), h('span', { class: 'num ' + (p.k === 'base' ? '' : (p.v > 0.00005 ? 'bad' : (p.v < -0.00005 ? 'good' : 'muted'))) }, p.k === 'base' ? (p.v * 100).toFixed(2) + '%' : ppS(p.v))));
    q.appendChild(this.sec('fi-qparts', '地方债 3 年期的报价构成', '', function () {
      const b = h('div', null, pl);
      const sub = (parts.find(function (p) { return p.k === 'fis'; }) || {}).sub;
      if (sub) b.appendChild(h('div', { class: 'tiny muted', style: { marginTop: '4px' } }, '负债率（未偿本金 ÷ 全年地铁基础额度）' + sub.load.toFixed(2) + ' · 负债 ' + ppS(sub.debt) + ' · 财力 ' + ppS(sub.fiscF) + (sub.overdue ? ' · 逾期 ' + ppS(sub.overdue) : '') + (sub.neg ? ' · 负余额 ' + ppS(sub.neg) : '')));
      b.appendChild(h('div', { class: 'note', style: { marginTop: '6px' } }, '利率随市场与本市财政状况变化，发行后锁定。'));
      return b;
    }, false, 'info'));
    el.appendChild(q);
    el.appendChild(this.sec('fi-bond', '债券融资', U.fmtMoney(E.principalDebt()) + ' 未偿本金', function () { return self.bondBlock(); }, true, 'wallet'));
    el.appendChild(this.sec('fi-debt', '债务详情与偿债预测', E.bonds.filter(function (b) { return !b.done; }).length + ' 笔未到期', function () { return self.debtBlock(); }, false, 'calYear'));
  };
  // ---------- 财政：月度账本（科目分开：财政收入、融资到账、建设支出、运营成本、利息、本金偿还、逾期费用） ----------
  const BK = CM.Economy.BUILD_KINDS;
  const buildOf = function (r) { let s = 0; for (const k of BK) s += r[k] || 0; return s; };
  const incomeOf = function (r) { return (r.grant || 0) + (r.fare || 0) + (r.reward || 0) + (r.commerce || 0) + (r.ppp || 0) + (r.fleetSale || 0); };
  const serviceOf = function (r) { return (r.interest || 0) + (r.principal || 0) + (r.penalty || 0); };
  UI.prototype.ledgerBlock = function () {
    const g = this.g(), E = g.econ, c = E.cur, free = E.isFree(), oi = E.opsIndex(g.clock.y), M = function (v) { return U.fmtMoney(v || 0); };
    let st = 0; for (const s of g.compiled.stations) st += CFG.ops.stationDaily[s.size] * oi;
    const box = h('div');
    const group = function (title, rows, cls) { box.appendChild(h('div', { class: 'fl-g ' + (cls || '') }, h('div', { class: 'fl-h' }, title), this.kv(rows))); }.bind(this);
    if (!free) box.appendChild(this.kv([['期初一般资金', M(c.start)], ['期初建设专项资金', M(c.capexStart)]]));
    group('财政收入', [['政府拨款', '+ ' + M(c.grant)], ['票款', '+ ' + M(c.fare)], ['车站商业（广告与租金）', '+ ' + M(c.commerce)], c.ppp || g.corp ? ['政府合同（补助、付费与退还保证金）', '+ ' + M(c.ppp)] : null, ['任务奖励', '+ ' + M(c.reward)], c.fleetSale ? ['出售列车（残值）', '+ ' + M(c.fleetSale)] : null], 'in');
    if (!free) group('融资到账（不计入收入）', [['债券募集 → 建设专项资金', '+ ' + M(c.bond)]], 'fin');
    group('建设支出', [['建设与拆迁', '− ' + M(buildOf(c))], !free ? ['其中由专项资金支付', M(c.capexUse)] : null], 'out');
    group('运营成本', [['列车运行与车站', '− ' + M(c.ops)], c.todCost ? ['车站商业运营与维护', '− ' + M(c.todCost)] : null], 'out');
    if (!free && (c.pppOut || g.corp)) group('合同支出', [['保证金、地价、超额分成与违约金', '− ' + M(c.pppOut)]], 'out');
    if (!free) group('偿债', [['利息', '− ' + M(c.interest)], ['本金偿还', '− ' + M(c.principal)], ['逾期费用', '− ' + M(c.penalty)]], 'debt');
    box.appendChild(h('div', { class: 'note', style: { marginTop: '6px' } }, '每日运营成本约 ' + U.fmtMoney(((g.model.daily && g.model.daily.carKm) || 0) * CFG.ops.carKmCost * oi + st) + '（列车运行 + ' + g.compiled.stations.length + ' 座车站），票款与运营成本逐日结算；利息与本金在每月初拨款之后支付。'));
    if (E.ledger.length) {
      const t = h('table', { class: 'tbl', style: { marginTop: '8px' } }, h('tr', null, h('th', null, '月份'), h('th', null, '财政收入'), !free ? h('th', null, '融资') : null, h('th', null, '建设'), h('th', null, '运营'), !free ? h('th', null, '偿债') : null, h('th', null, '期末')));
      for (const r of E.ledger.slice(-12).reverse()) t.appendChild(h('tr', null, h('td', null, r.y + '.' + r.m), h('td', null, U.fmtYi(incomeOf(r), 2)), !free ? h('td', null, r.bond ? U.fmtYi(r.bond, 2) : '—') : null, h('td', null, U.fmtYi(buildOf(r), 2)), h('td', null, U.fmtYi(r.ops || 0, 2)), !free ? h('td', null, serviceOf(r) ? U.fmtYi(serviceOf(r), 2) : '—') : null, h('td', { class: r.end < 0 ? 'bad' : '' }, free ? '—' : U.fmtYi(r.end, 1))));
      box.append(h('div', { class: 'tiny muted', style: { marginTop: '8px' } }, '最近 12 个月（' + CFG.money.yi + '；期末为一般资金）'), h('div', { class: 'tbl-wrap' }, t));
    }
    return box;
  };
  // ---------- 财政：债券融资概况与发行入口 ----------
  UI.prototype.bondBlock = function () {
    const self = this, g = this.g(), E = g.econ, y = g.clock.y, D0 = CM.Economy.BOND_DEF;
    const box = h('div');
    for (const k of ['local', 'ct']) {
      const out = E.principalDebt(k), cap = E.bondCap(k, y), quota = E.bondQuota(k, y), used = E.issuedIn(k, y), room = E.bondRoom(k, y), block = E.bondBlock(k);
      box.appendChild(h('div', { class: 'bond-row' },
        h('div', { class: 'row between' }, h('b', null, D0[k].name), h('span', { class: 'tiny muted' }, '3 年期 ' + (E.bondRate(k, y, 3) * 100).toFixed(2) + '% · 6 年期 ' + (E.bondRate(k, y, 6) * 100).toFixed(2) + '%')),
        h('div', { class: 'bond-bar', 'data-tip': '未偿本金 ' + U.fmtMoney(out) + ' / 上限 ' + U.fmtMoney(cap) }, h('i', { style: { width: Math.min(100, out / Math.max(1, cap) * 100).toFixed(1) + '%' } })),
        h('div', { class: 'row between tiny' }, h('span', { class: 'muted' }, '未偿本金 ' + U.fmtMoney(out) + ' / 上限 ' + U.fmtMoney(cap)), h('span', { class: block ? 'bad' : 'muted' }, block ? '暂停发行' : '本年还可发行 ' + U.fmtMoney(room) + '（年度额度 ' + U.fmtMoney(quota) + '，已发 ' + U.fmtMoney(used) + '）'))));
    }
    box.appendChild(h('div', { class: 'row', style: { marginTop: '10px', gap: '8px' } },
      h('button', { class: 'btn primary sm', disabled: E.bondBlock('local') && E.bondBlock('ct') ? true : null, onclick: function () { self.showBondIssue(); } }, CM.icon('plus'), '发行债券'),
      h('span', { class: 'tiny muted grow' }, '募集资金进入建设专项资金，只能用于地铁建设及改扩建；每年付息、到期一次还本。')));
    return box;
  };
  // ---------- 财政：债务详情与未来偿债预测 ----------
  UI.prototype.debtBlock = function () {
    const g = this.g(), E = g.econ, D0 = CM.Economy.BOND_DEF, box = h('div');
    const live = E.bonds.filter(function (b) { return !b.done; }), overdue = E.bonds.filter(function (b) { return b.done && !E.bondSettled(b); }), done = E.bonds.filter(function (b) { return E.bondSettled(b); });
    if (!live.length) box.appendChild(h('div', { class: 'note' }, '目前没有未到期的债券。'));
    for (const b of live.concat(overdue)) {
      const k = b.paidYears + 1, t = b.ym0 + 12 * k, ny = Math.floor(t / 12), nm = t % 12 + 1, due = b.amount * b.rate + (k >= b.term ? b.amount : 0);
      box.appendChild(h('div', { class: 'debt-card', 'data-tip': b.quote ? '发行时报价：' + b.quote.map(function (p) { return p[0] + ' ' + (p[1] * 100).toFixed(2) + '%'; }).join('；') : null },
        h('div', { class: 'row between' }, h('b', null, D0[b.kind].name + ' · ' + U.fmtMoney(b.amount)), h('span', { class: 'tag' + (b.done ? ' bad' : '') }, b.done ? '已到期 · 本息未还清' : b.term + ' 年期 · 合同利率 ' + (b.rate * 100).toFixed(2) + '%')),
        h('div', { class: 'tiny muted' }, b.issued[0] + '年' + b.issued[1] + '月发行 · ' + (b.issued[0] + b.term) + '年' + b.issued[1] + '月到期 · 实付利息 ' + U.fmtMoney(b.interestPaid) + '（已结算 ' + b.paidYears + ' / ' + b.term + ' 期）'),
        b.done ? null : h('div', { class: 'small', style: { marginTop: '3px' } }, '下次还款：' + ny + '年' + nm + '月 ' + U.fmtMoney(due) + (k >= b.term ? '（含到期本金）' : '（利息）')),
        (b.interestArrears || 0) + (b.principalArrears || 0) > CM.Economy.MONEY_EPS ? h('div', { class: 'small bad', style: { marginTop: '3px' } }, '逾期利息 ' + U.fmtMoney(b.interestArrears || 0) + ' · 逾期本金 ' + U.fmtMoney(b.principalArrears || 0)) : null));
    }
    if (done.length) box.appendChild(h('div', { class: 'tiny muted', style: { margin: '6px 0' } }, '已还清 ' + done.length + ' 笔，共 ' + U.fmtMoney(done.reduce(function (s, b) { return s + b.amount; }, 0))));
    if (E.overdue > CM.Economy.MONEY_EPS) { const P = E.odParts(); box.appendChild(this.kv([['逾期合计', U.fmtMoney(E.overdue), 'bad'], ['其中利息 / 本金 / 费用', U.fmtMoney(P.interest) + ' / ' + U.fmtMoney(P.principal) + ' / ' + U.fmtMoney(P.penalty)], ['已逾期', E.overdueMonths + ' 个月']])); }
    const fc = E.debtForecast(g.clock.y, g.clock.m, 7);
    const t = h('table', { class: 'tbl', style: { marginTop: '8px' } }, h('tr', null, h('th', null, '年份'), h('th', null, '利息'), h('th', null, '到期本金'), h('th', null, '合计')));
    let any = false;
    for (const r of fc) { const s = r.interest + r.principal; if (s > CM.Economy.MONEY_EPS) any = true; t.appendChild(h('tr', null, h('td', null, r.y + (r.y === g.clock.y ? '（剩余月份）' : '')), h('td', null, r.interest > CM.Economy.MONEY_EPS ? U.fmtMoney(r.interest) : '—'), h('td', null, r.principal > CM.Economy.MONEY_EPS ? U.fmtMoney(r.principal) : '—'), h('td', null, s > CM.Economy.MONEY_EPS ? U.fmtMoney(s) : '—'))); }
    box.appendChild(h('div', { class: 'fl-h', style: { marginTop: '10px' } }, '未来偿债预测'));
    if (any) box.appendChild(h('div', { class: 'tbl-wrap' }, t));
    else box.appendChild(h('div', { class: 'note' }, E.overdue > CM.Economy.MONEY_EPS ? '未来几年没有新的计划内到期本息；现有逾期仍需偿还，详见上方欠款明细。' : '未来几年没有需要偿还的本息。'));
    box.appendChild(h('div', { class: 'note', style: { marginTop: '6px' } }, '本息从一般资金支付；不足时记为逾期，收取逾期费用并限制发债。'));
    return box;
  };
  // ---------- 财政：资金流水 ----------
  UI.prototype.flowBlock = function () {
    const E = this.g().econ, box = h('div');
    if (!E.flow.length) { box.appendChild(h('div', { class: 'note' }, '还没有资金流水。')); return box; }
    const list = h('div', { class: 'flow-list' });
    for (const f of E.flow.slice(-40).reverse()) {
      list.appendChild(h('div', { class: 'flow-row' },
        h('span', { class: 'flow-d' }, f.y + '.' + f.m + '.' + f.d),
        h('span', { class: 'flow-n' }, f.note, f.acct === 'capex' ? h('span', { class: 'tag fin' }, '专项') : null),
        h('span', { class: 'flow-a ' + (f.amount >= 0 ? 'good' : (f.kind === 'overdue' ? 'bad' : '')) }, (f.amount >= 0 ? '+' : '−') + U.fmtMoney(Math.abs(f.amount)))));
    }
    box.appendChild(list);
    box.appendChild(h('div', { class: 'note', style: { marginTop: '6px' } }, '标「专项」的是建设专项资金账户；其余为一般资金。票款与运营成本按月汇总。'));
    return box;
  };
  // ---------- 发行债券 ----------
  UI.prototype.showBondIssue = function () {
    const self = this, g = this.g();
    if (!g || g.pending || g.jumping) { this.toast('正在结算，请稍候再发行债券', 'info'); return; }
    // 固定确认前的日期和条款，避免模拟跨年后实际利率、额度与还款日期偏离预览。
    this.setSpeed(0);
    const E = g.econ, y = g.clock.y, D0 = CM.Economy.BOND_DEF;
    let kind = !E.bondBlock('local') && E.bondRoom('local', y) > 0 ? 'local' : 'ct', term = 3, amount = 0;
    const cards = h('div', { class: 'bond-kinds' });
    const slider = h('input', { type: 'range', min: 0, max: 1, step: 1, value: 0, 'aria-label': '发行金额' });
    const amt = h('div', { class: 'fare-v' });
    const pv = h('div');
    const ok = h('button', { class: 'btn primary', onclick: function () {
      const r = g.issueBond(kind, term, amount);
      if (!r.ok) { self.toast(r.error, 'bad'); return; }
      CM.Sound && CM.Sound.play('coin');
      self.toast('已发行' + D0[kind].name + ' ' + U.fmtMoney(r.bond.amount) + '，资金进入建设专项资金', 'good');
      self.closeScreen(); self.markUnsaved(); self.finTab = 'debt'; self.openPage('finance', 'debt', { root: true });
    } }, CM.icon('check'), '确认发行');
    const termCtl = h('div', { class: 'seg-ctl' });
    const draw = function () {
      cards.innerHTML = '';
      for (const k of ['local', 'ct']) {
        const block = E.bondBlock(k), room = E.bondRoom(k, y);
        cards.appendChild(h('button', { class: 'bond-kind' + (kind === k ? ' on' : ''), disabled: block || room <= 0 ? true : null, 'data-silent': '1', onclick: function () { if (kind !== k) { kind = k; CM.Sound && CM.Sound.play('soft'); draw(); } } },
          h('b', null, D0[k].name), h('small', null, D0[k].desc),
          h('span', { class: 'bk-rate' }, (E.bondRate(k, y, term) * 100).toFixed(2) + '%', h('small', null, ' 年利率（' + term + ' 年期）')),
          h('small', { class: block ? 'bad' : 'muted' }, block || ('本年还可发行 ' + U.fmtMoney(room)))));
      }
      termCtl.innerHTML = '';
      for (const t of [3, 6]) termCtl.appendChild(h('button', { class: term === t ? 'on' : '', 'data-silent': '1', onclick: function () { if (term !== t) { term = t; CM.Sound && CM.Sound.play('soft'); draw(); } } }, t + ' 年期'));
      const room = E.bondBlock(kind) ? 0 : E.bondRoom(kind, y), step = Math.max(1, Math.round(room / 100));
      slider.max = String(Math.max(0, Math.floor(room / step) * step)); slider.step = String(step);
      if (amount > +slider.max || amount <= 0) amount = Math.min(+slider.max, Math.max(step, Math.round(room / 2 / step) * step));
      slider.value = String(amount); slider.disabled = room <= 0;
      show();
    };
    const show = function () {
      const q = E.bondQuote(kind, y, term), rate = q.rate, it = amount * rate;
      amt.textContent = U.fmtMoney(amount);
      pv.innerHTML = '';
      pv.appendChild(self.kv([['年利率（发行时锁定）', (rate * 100).toFixed(2) + '%'], ['每年利息', U.fmtMoney(it)], ['利息合计（' + term + ' 年）', U.fmtMoney(it * term)],
        ['首次付息', (g.clock.y + 1) + '年' + g.clock.m + '月'], ['到期还本', (g.clock.y + term) + '年' + g.clock.m + '月 ' + U.fmtMoney(amount)], ['发行后建设专项资金', U.fmtMoney(E.capex + amount)]]));
      pv.appendChild(h('div', { class: 'qline' }, q.parts.map(function (p, i) { return h('span', { class: p.k === 'base' ? '' : (p.v > 0.00005 ? 'bad' : (p.v < -0.00005 ? 'good' : 'muted')) }, (i ? (p.v < 0 ? ' − ' : ' + ') : '') + p.label.replace(/（.*）/, '') + ' ' + (Math.abs(p.v) * 100).toFixed(2) + '%'); })));
      ok.disabled = !(amount > 0);
    };
    slider.addEventListener('input', function () { amount = +slider.value; show(); });
    draw();
    const card = h('div', { class: 'card bond-dlg' },
      h('div', { class: 'card-head' }, h('span', { class: 'badge b-gold' }, CM.icon('wallet')), h('div', { class: 'grow' }, h('h2', null, '发行债券'), h('div', { class: 'tiny muted' }, '募集资金只能用于地铁建设及改扩建')), h('button', { class: 'iconbtn', 'data-tip': '关闭', 'data-key': 'Esc', onclick: function () { self.closeScreen(); } }, CM.icon('close'))),
      cards,
      h('div', { class: 'field' }, h('label', null, '期限'), termCtl),
      h('div', { class: 'field' }, h('label', null, '发行金额'), h('div', { class: 'fare-top' }, amt), h('div', { class: 'fare-slider' }, h('span', { class: 'tiny muted' }, '0'), slider, h('span', { class: 'tiny muted' }, '本年额度'))),
      pv,
      h('div', { class: 'note', style: { marginTop: '8px' } }, '借款进入建设专项资金，本息从一般资金支付。'),
      h('div', { class: 'modal-actions' }, h('button', { class: 'btn', onclick: function () { self.closeScreen(); } }, '取消'), ok));
    this.openScreen(card, function () { self.closeScreen(); });
  };
  // 票价：按里程计费或统一票价（v2.1 第二轮），金额以内部货币保存、按当期显示货币格式化
  // 票价：参数为内部金额（开局货币），按当期显示货币格式化
  // 出行结构（v2.6，DATA.bg.modes）：地铁以外的出行里，电车、市郊铁路、步行、公交与小汽车的比重随年代变化（估算）；地铁的比重是玩家自己的成绩，不画进来
  UI.modeMix = function (g) {
    const B = CM.DATA.bg; if (!B || !B.modes) return null;
    const t = g.year(), y0 = CFG.START.y, y1 = 2030, W = 320, H = 96;
    const at = function (y) {
      const out = B.modes.map(function (m) { return { id: m.id, name: m.name, color: m.color, v: U.interp(m.share, y) }; });
      const road = Math.max(0, 1 - out.reduce(function (s, m) { return s + m.v; }, 0)), bus = road * U.interp(B.busShare, y);
      out.push({ id: 'bus', name: '公共汽车', color: '#c8102e', v: bus }, { id: 'car', name: '小汽车与货车', color: '#8a93a0', v: road - bus });
      return out;
    };
    const years = []; for (let y = y0; y <= y1; y += 2) years.push(y);
    const X = function (y) { return (y - y0) / (y1 - y0) * W; };
    const series = years.map(at), n = series[0].length;
    let paths = '';
    const base = years.map(function () { return 0; });
    for (let k = 0; k < n; k++) {
      const top = years.map(function (_, i) { return base[i] + series[i][k].v; });
      let d = 'M' + X(years[0]).toFixed(1) + ' ' + (H - top[0] * H).toFixed(1);
      for (let i = 1; i < years.length; i++) d += 'L' + X(years[i]).toFixed(1) + ' ' + (H - top[i] * H).toFixed(1);
      for (let i = years.length - 1; i >= 0; i--) d += 'L' + X(years[i]).toFixed(1) + ' ' + (H - base[i] * H).toFixed(1);
      paths += '<path d="' + d + 'Z" fill="' + series[0][k].color + '" opacity="0.82"/>';
      for (let i = 0; i < years.length; i++) base[i] = top[i];
    }
    const cx = X(U.clamp(t, y0, y1));
    const svg = '<svg viewBox="0 -2 ' + W + ' ' + (H + 16) + '" class="era-mix" role="img">' + paths +
      '<line x1="' + cx.toFixed(1) + '" x2="' + cx.toFixed(1) + '" y1="0" y2="' + H + '" stroke="#17202c" stroke-width="1.4"/>' +
      [1914, 1945, 1981, 2020].map(function (y) { return '<text x="' + X(y).toFixed(1) + '" y="' + (H + 11) + '" text-anchor="middle" font-size="9" fill="currentColor" opacity=".6">' + y + '</text>'; }).join('') + '</svg>';
    const now = at(t), keep = CM.Eras.bg(t);
    return h('div', { class: 'era-mixbox' }, h('div', { html: svg }),
      h('div', { class: 'era-chips' }, now.map(function (m) { return h('span', { class: 'chip' }, h('i', { class: 'era-mixdot', style: { background: m.color } }), m.name + ' ' + U.fmtPct(m.v, 0)); })),
      keep && keep.keep ? h('div', { class: 'note muted tiny' }, '竖线是现在。新地铁的乘客不全来自小汽车：这个年代的路面空出来后，约 ' + U.fmtPct(keep.keep, 0) + ' 又会被公交、货车和新增的小汽车占满，所以修了地铁，路上不一定就变空。') : null);
  };
  // 英镑十进制之前（伦敦，1971 年前）：1 英镑 = 240 便士 = 20 先令，票价精确到半便士
  const fmtPence = function (v) {
    const d = Math.round(v * 480) / 2, en = CM.I18n && CM.I18n.get() === 'en', P = en ? 'd' : ' 便士', S = en ? 's' : ' 先令';
    if (d < 12) return d + P;
    const s = Math.floor(d / 12), r = d - s * 12; return s + S + (r ? ' ' + r + P : '');
  };
  UI.fmtFare = function (v) { if (CFG.money.pence) return fmtPence(v) + '/次'; v = +U.cur(v).toFixed(4); return CFG.money.sym + (v % 1 ? (v * 10 % 1 ? (v * 100 % 1 ? v.toFixed(3) : v.toFixed(2)) : v.toFixed(1)) : String(v)) + '/次'; };
  // 票价文字：统一票价「¥2/次」；按里程「¥2 起 · 按里程」（简短）或完整规则
  UI.fareText = function (f, long) {
    if (!f || f.mode !== 'dist') return (long ? '全网统一票价 ' : '') + UI.fmtFare(f ? f.flat : 0);
    const m = function (v) { return UI.fmtFare(v).replace('/次', ''); };
    if (!long) return m(f.flat) + ' 起 · 按里程';
    return '起步 ' + m(f.flat) + '（' + f.km0 + ' km 内），每 ' + f.step + ' km 加 ' + m(f.inc) + (f.cap > 0 ? '，最高 ' + m(f.cap) : '');
  };
  // 估算某票价方案的平均每次票价：乘车距离按均值为当前平均乘距的伽马分布（形状 2）近似，再按当前实际平均票价校准
  UI.fareEstimate = function (f, g) {
    const d = g.model.daily || {}, riders = d.metro || 0, mean = riders > 0 ? (d.metroPkm || 0) / riders : 0;
    const exp = function (ff) {
      if (ff.mode !== 'dist' || !(mean > 0)) return ff.flat;
      const th = mean / 2, dx = Math.max(0.05, mean / 80); let s = 0, w = 0;
      for (let x = dx / 2; x < mean * 8; x += dx) { const p = x * Math.exp(-x / th); s += p * CM.Model.fareAt(ff, x); w += p; }
      return w > 0 ? s / w : ff.flat;
    };
    const actual = riders > 0 ? (d.fare || 0) / riders : 0, ec = exp(g.econ.fare);
    return { avg: exp(f) * (actual > 0 && ec > 0 ? actual / ec : 1), riders: riders, mean: mean, actual: actual };
  };
  // 调价的预估（v2.6.1）：按当前的平均乘距分布，用与方式选择相同的票价折算估计客流与票款的变化。只是估算，实际结果要等出行重算
  UI.fareEffect = function (f, g) {
    const d = g.model.dailyWk || g.model.daily || {}, riders = d.metro || 0, mean = riders > 0 ? (d.metroPkm || 0) / riders : 0;
    if (!(mean > 0)) return null;
    const M = CM.Model, y = g.clock.y, vot = U.interp(CFG.choice.vot, y), th = CFG.choice.theta, cur = g.econ.fare;
    const cov = U.clamp(d.coverage || 0.5, 0.15, 1), p = U.clamp((d.metroShare || 0) / Math.pow(cov, 1.5), 0.1, 0.75);
    const t = mean / 2, dx = Math.max(0.1, mean / 40);
    let w0 = 0, wr = 0, rev0 = 0, rev1 = 0;
    for (let x = dx / 2; x < mean * 8; x += dx) {
      const w = x * Math.exp(-x / t), phi = Math.exp(-th * (M.fareMinAt(f, x, y, vot) - M.fareMinAt(cur, x, y, vot))), r = phi / (1 - p + p * phi);
      w0 += w; wr += w * r; rev0 += w * M.fareAt(cur, x); rev1 += w * r * M.fareAt(f, x);
    }
    return { riders: wr / w0, rev: rev0 > 0 ? rev1 / rev0 : 1, fareNow: d.fare || 0 };
  };
  // 票价设置（v2.1 第二轮）：按里程计费（起步价、起步里程、每段里程、每段加价、封顶）或统一票价；调好后点「应用新票价」
  UI.prototype.fareEditor = function () {
    const g = this.g(), E = g.econ, self = this, R = CM.fareRangeNow(g), div = CFG.money.div || 1, D = CFG.fareDist;
    // 滑块使用当期显示货币；内部仍按开局货币记账（toIn / toShow 换算），票价不因货币改革而改变实际水平
    const toIn = function (v) { return div === 1 ? v : v * div; }, toShow = function (v) { return div === 1 ? v : Math.round(v / div / R.step) * R.step; };
    const q = function (v) { return +(Math.round(v / R.step) * R.step).toFixed(6); };
    const nf = Object.assign({}, E.fare);
    if (nf.mode !== 'dist') Object.assign(nf, { km0: D.km0, step: D.step, inc: Math.max(R.step, q(nf.flat * D.inc)), cap: q(nf.flat * D.cap) });
    const money = function (v) { return UI.fmtFare(v).replace('/次', ''); };
    // 布局（v2.7 界面打磨）：左边是计费方式和分组的参数（名称和数值在上、滑块在下、两端标出范围），底部是应用与自动调价；
    // 右边是票价阶梯（新票价与现行票价对比）、调价预估、现状和说明。拖动时只改数字和柱高，行数和位置不变
    const box = h('div', { class: 'fare-ed' });
    const val = h('div', { class: 'fare-v num' }), sub = h('span', { class: 'fe-sub' });
    const effect = h('div', { class: 'fe-now' }), tiles = h('div', { class: 'fe-tiles' }), ladder = h('div', { class: 'fe-ladder' }), status = h('span', { class: 'fe-status' });
    const applyBtn = h('button', { class: 'btn primary', onclick: function () { apply(); } }, CM.icon('check', 15), '应用新票价');
    const resetBtn = h('button', { class: 'btn ghost', onclick: function () { Object.assign(nf, E.fare); sync(); refresh(); } }, '还原');
    const syncs = [];
    const row = function (label, s, out, lo, hi, upd) {
      syncs.push(upd);
      return h('div', { class: 'fe-row' }, h('div', { class: 'fe-rh' }, h('span', { class: 'fe-k' }, label), out), s, h('div', { class: 'fe-scale' }, h('span', null, lo), h('span', null, hi)));
    };
    const moneyRow = function (key, label, min, max, zero) {
      const out = h('b', { class: 'fe-val num' }), s = h('input', { type: 'range', min: min, max: max, step: R.step, 'aria-label': label });
      const txt = function () { out.textContent = nf[key] === 0 && zero ? zero : money(nf[key]); };
      s.addEventListener('input', function () { const vs = +s.value; nf[key] = E.fare[key] != null && vs === toShow(E.fare[key]) ? E.fare[key] : toIn(vs); txt(); refresh(); });
      return row(label, s, out, min === 0 && zero ? zero : money(toIn(min)), money(toIn(max)), function () { s.value = toShow(nf[key]); txt(); });
    };
    const kmRow = function (key, label, min, max) {
      const out = h('b', { class: 'fe-val num' }), s = h('input', { type: 'range', min: min, max: max, step: 1, 'aria-label': label });
      s.addEventListener('input', function () { nf[key] = +s.value; out.textContent = nf[key] + ' km'; refresh(); });
      return row(label, s, out, min + ' km', max + ' km', function () { s.value = nf[key]; out.textContent = nf[key] + ' km'; });
    };
    const group = function (title, rows) { return h('div', { class: 'fe-group' }, h('div', { class: 'fe-gh' }, title), rows); };
    const modeBox = h('div', { class: 'seg-ctl fare-mode' });
    const modeBtns = [['dist', '按里程计费'], ['flat', '统一票价']].map(function (m) { const b = h('button', { onclick: function () { nf.mode = m[0]; refresh(); } }, m[1]); b.dataset.m = m[0]; modeBox.appendChild(b); return b; });
    const distBox = h('div', { class: 'fe-groups' },
      group('起步', [moneyRow('flat', '起步价', R.min, R.max), kmRow('km0', '起步里程', 1, 20)]),
      group('里程加价', [kmRow('step', '每段里程', 1, 20), moneyRow('inc', '每段加价', R.step, Math.max(R.step, R.max / 2)), moneyRow('cap', '封顶', 0, R.max * 3, '不封顶')]));
    const flatBox = h('div', { class: 'fe-groups' }, group('全网统一', [moneyRow('flat', '票价', R.min, R.max)]));
    // 票价阶梯：四个乘距的票价，实心柱是调整后的，浅色柱是现行的
    const cols = [5, 10, 20, 30].map(function (k) {
      const ghost = h('i', { class: 'fe-ghost' }), bar = h('i', { class: 'fe-bar' }), v = h('b', { class: 'num' });
      ladder.appendChild(h('div', { class: 'fe-col' }, v, h('div', { class: 'fe-well' }, ghost, bar), h('small', null, k + ' km')));
      return { k: k, ghost: ghost, bar: bar, v: v };
    });
    const tile = function (label) { const b = h('b', { class: 'num' }), s = h('small'), el = h('div', { class: 'fe-tile' }, h('span', null, label), b, s); tiles.appendChild(el); return { b: b, s: s, el: el }; };
    const tR = tile('估算客流变化'), tV = tile('估算票款变化'), tD = tile('估算日票款'), tS = tile('满意度影响');
    const vot = U.interp(CFG.choice.vot, g.clock.y);
    const cur = function () { return nf.mode === 'dist' ? { mode: 'dist', flat: nf.flat, km0: nf.km0, step: nf.step, inc: nf.inc, cap: nf.cap } : { mode: 'flat', flat: nf.flat }; };
    const same = function () { return nf.mode === E.fare.mode && CM.Model.fareKey(cur()) === CM.Model.fareKey(E.fare); };
    const sync = function () { for (const f of syncs) f(); };
    const setTile = function (t, v, cls, note) { t.b.textContent = v; t.el.className = 'fe-tile' + (cls ? ' ' + cls : ''); t.s.textContent = note; };
    const refresh = function () {
      if (nf.mode === 'dist' && nf.cap > 0 && nf.cap < nf.flat) nf.cap = nf.flat;
      const f = cur(), changed = !same();
      for (const b of modeBtns) b.classList.toggle('on', b.dataset.m === nf.mode);
      distBox.hidden = nf.mode !== 'dist'; flatBox.hidden = nf.mode === 'dist';
      sync();
      val.textContent = nf.mode === 'dist' ? money(f.flat) + ' 起' : UI.fmtFare(f.flat);
      sub.textContent = nf.mode === 'dist' ? '按乘坐的地铁里程计费 · 换乘不另收费' : '全网统一 · 换乘不另收费';
      const nv = cols.map(function (c) { return CM.Model.fareAt(f, c.k); }), ov = cols.map(function (c) { return CM.Model.fareAt(E.fare, c.k); }), mx = Math.max.apply(null, nv.concat(ov)) || 1;
      cols.forEach(function (c, i) { c.v.textContent = money(nv[i]); c.bar.style.height = Math.max(4, nv[i] / mx * 100).toFixed(1) + '%'; c.ghost.style.height = Math.max(4, ov[i] / mx * 100).toFixed(1) + '%'; c.bar.classList.toggle('up', nv[i] > ov[i] + 1e-9); c.bar.classList.toggle('down', nv[i] < ov[i] - 1e-9); });
      applyBtn.disabled = !changed; resetBtn.disabled = !changed;
      status.textContent = changed ? '有未应用的改动' : '与现行票价相同'; status.classList.toggle('on', changed);
      const est = UI.fareEstimate(f, g), sat = CM.Economy.fareSatEffect(est.avg, g.clock.y), d = g.model.daily || {};
      const ref = CM.Model.fareRef(g.clock.y), fx = changed ? UI.fareEffect(f, g) : null, hike = changed ? E.fareHikeEffect(f, g.clock.y) : 0, pct = function (r) { return (r >= 1 ? '+' : '−') + Math.abs(Math.round((r - 1) * 100)) + '%'; };
      setTile(tR, fx ? pct(fx.riders) : '—', fx ? (fx.riders < 1 ? 'warn' : 'good') : '', fx ? '与现行票价相比' : '调价后显示');
      setTile(tV, fx ? pct(fx.rev) : '—', fx ? (fx.rev < 1 ? 'warn' : 'good') : '', fx ? '与现行票价相比' : '调价后显示');
      setTile(tD, fx ? U.fmtMoney(fx.fareNow * fx.rev / 10000) : (est.riders > 0 ? U.fmtMoney((d.fare || 0) / 10000) : '—'), '', fx ? '估算' : '现行');
      setTile(tS, hike < 0 ? U.fmtSigned(hike, 1) + ' 分' : '无', hike <= -4 ? 'bad' : (hike < 0 ? 'warn' : 'good'), sat < -0.05 ? '票价负担 ' + U.fmtSigned(sat, 1) + ' 分' : '无票价负担');
      effect.innerHTML = '';
      effect.appendChild(self.kv([
        ['物价参考票价', money(ref)],
        ['票价实际水平', '开局的 ' + Math.round(f.flat / ref * 100) + '%', f.flat / ref > 1.5 ? 'warn' : (f.flat / ref < 0.7 ? 'warn' : 'good')],
        ['当前日票务收入', est.riders > 0 ? U.fmtMoney((d.fare || 0) / 10000) : '暂无客流'],
        ['日均客流', est.riders > 0 ? U.fmtPeople(est.riders) + ' 人次' : '—'],
        ['平均乘距 · 每次', est.riders > 0 ? U.fmtNum(est.mean, 1) + ' km · ' + money(est.actual) : '—'],
      ]));
      if (CM.I18n) CM.I18n.localize(box);
    };
    const apply = function () {
      if (same()) return;
      const f = cur();
      const hike = E.setFare(f, g.clock.y, g.clock.m); g.model.fare = E.fare; g.model.wake(2); g.touch();
      g.invalidatePrediction('票价已修改，建设预测需要按新票价重新计算');
      g.logEvent({ tag: '经营', title: '调整票价', desc: UI.fareText(f, true) });
      self.toast('票价已调整：' + UI.fareText(f, true) + '。居民出行选择正在重新计算' + (hike <= -2 ? '；涨幅明显高于物价，满意度下降 ' + Math.abs(hike).toFixed(1) + ' 分，持续 6 个月' : ''), hike <= -2 ? 'warn' : 'good');
      self.markUnsaved();
      refresh();
    };
    const autoSw = h('button', { class: 'switch' + (E.fareAuto ? ' on' : ''), role: 'switch', 'aria-checked': E.fareAuto ? 'true' : 'false', 'aria-label': '随物价自动调价', onclick: function () {
      E.setFareAuto(!E.fareAuto, g.clock.y); autoSw.classList.toggle('on', !!E.fareAuto); autoSw.setAttribute('aria-checked', E.fareAuto ? 'true' : 'false'); self.markUnsaved();
      if (CM.Sound) CM.Sound.play('toggle');
    } }, h('i'));
    refresh();
    const card = function (title, note, body) { return h('div', { class: 'fe-card' }, h('div', { class: 'fe-ch' }, h('b', null, title), note ? h('small', null, note) : null), body); };
    box.append(
      h('div', { class: 'fe-main' },
        h('div', { class: 'fe-head' }, h('div', { class: 'fe-price' }, val, sub), modeBox),
        distBox, flatBox,
        h('div', { class: 'fe-actions' }, status, h('span', { class: 'grow' }), resetBtn, applyBtn),
        h('div', { class: 'fo-auto fe-auto' }, h('span', { class: 'grow' }, h('b', null, '随物价自动调价'), h('small', null, '每年 1 月按物价涨幅调整票价，满意度每次略降。客流也会跟着变，不是白赚')), autoSw)),
      h('div', { class: 'fe-side' },
        card('票价阶梯', '浅色为现行票价', ladder),
        card('调价预估', '按现在的客流估算', tiles),
        card('现状', null, effect),
        this.sec('fi-fare-note', '怎么定票价', '', function () {
          return h('div', { class: 'note' }, '物价参考票价是开局票价按物价折算到今年的价格。跟着物价调价时客流下降有限；超过参考票价越多，乘客流失越快，超过约 1.3 倍后多收的钱抵不上流失的客流。调价影响指满意度下降，持续 6 个月，涨幅超过物价越多越重。票价负担上限 −9 分，平均票价不超过时间价值的 35% 时没有负担。按里程计费时长途乘客付得更多。' + g.clock.y + ' 年居民时间价值约 ' + U.cur(vot).toFixed(U.cur(vot) < 10 ? 2 : 1) + ' ' + CFG.money.unit + '/小时（估算）。应用后居民出行选择将在数秒内重新计算。');
        }, false, 'info')));
    return box;
  };

  // ======================== 页面：任务 ========================
  // 分页：进行中 / 已完成 / 未完成。进行中的任务按剩余时间排序；每张卡片：类型图标、进度环、目标与当前值、
  // 连接任务的站点清单、连续月数、期限条（越临近越醒目）、奖励与未完成后果、定位入口
  const TASK_TYPE = {
    combo: ['layers', '综合目标'],
    connect: ['route', '连通线路'], coverage: ['target', '地铁覆盖'], zoneCong: ['car', '缓解拥堵'], zoneCov: ['map', '片区覆盖'],
    stationCrowd: ['people', '车站拥挤'], ridership: ['train', '客流增长'], recovery: ['coin', '运营收支'], facShare: ['pin', '设施接驳'],
    budgetConnect: ['wallet', '预算内连通'], lineCrowd: ['people', '拥挤区段'], lineCars: ['train', '线路扩容'], fiscal: ['bank', '财政调整'], lineEff: ['trend', '老线路效率'], regionCov: ['map', '片区覆盖'], xferHub: ['network', '换乘网络'],
  };
  // 复合任务的分项目标：每项一行，写明属于哪方面、是否达成与当前进度
  UI.prototype.taskParts = function (t, ev) {
    const box = h('div', { class: 'tk-parts' });
    for (const p of ev.parts || []) {
      const row = h('div', { class: 'tk-part ' + p.kind + (p.ok ? ' ok' : '') + (p.dead ? ' dead' : '') + (p.na ? ' na' : '') },
        CM.icon(p.ok ? 'check' : (p.dead ? 'close' : (p.wait ? 'hourglass' : (p.na ? 'info' : 'target'))), 14),
        h('div', { class: 'grow' }, h('div', { class: 'tk-pt' }, h('span', { class: 'tk-pk' }, CM.Tasks.PART_KIND[p.kind] || ''), p.core ? h('span', { class: 'tk-core' }, '主体') : null), h('div', { class: 'tk-px' }, p.text),
          !p.ok && !p.dead && !p.na && !p.wait && p.value > 0 ? h('div', { class: 'tk-pb' }, h('i', { style: { width: Math.round(p.value * 100) + '%' } })) : null));
      box.appendChild(row);
    }
    return box;
  };
  UI.prototype.taskRing = function (v, cls) {
    const p = U.clamp(v || 0, 0, 1), C = 2 * Math.PI * 17;
    return h('span', { class: 'tk-ring ' + (cls || ''), html: '<svg viewBox="0 0 40 40"><circle cx="20" cy="20" r="17" class="bg"/><circle cx="20" cy="20" r="17" class="fg" stroke-dasharray="' + C.toFixed(2) + '" stroke-dashoffset="' + (C * (1 - p)).toFixed(2) + '"/></svg><b>' + Math.round(p * 100) + '<small>%</small></b>' });
  };
  UI.prototype.page_tasks = function (id) {
    const g = this.g(), T = g.tasks, self = this, ch = g.econ.mode === 'challenge';
    const ym = g.ym();
    const corp = !!(CM.Corp && CM.Corp.enabled(g));   // 政府合同（v2.5）：经营挑战的真实城市
    let tab = id || this.taskTab || 'active';
    if (tab === 'ppp' && !corp) tab = 'active';
    this.taskTab = tab;
    const el = h('div', { class: 'tk-page' });
    const tabs = [['active', '进行中 ' + T.active.length, 'flag'], ['done', '已完成 ' + T.done.length, 'check'], ['failed', '未完成 ' + T.failed.length, 'error']];
    if (corp) tabs.push(['ppp', '合同' + (g.corp ? ' ' + (g.corp.tenders.length + g.corp.contracts.length) : ''), 'briefcase']);
    el.appendChild(this.pageTabs(tabs, tab, function (t) {
      self.taskTab = t; const top = self.stack[self.stack.length - 1]; if (top && top.kind === 'tasks') top.id = t; self.renderPage(false); self.rBody.scrollTop = 0;
    }));
    const body = h('div', { class: 'page-enter' });
    el.appendChild(body);
    const kindTag = function (t) { return t.kind === 'hist' ? h('span', { class: 'tag hist' }, '历史参考') : (t.kind === 'opt' || t.kind === 'offer' ? h('span', { class: 'tag opt' }, t.scenario ? '城市难题' : '可选挑战') : (t.cityId ? h('span', { class: 'tag est' }, '本城动态') : h('span', { class: 'tag info' }, '动态任务'))); };
    // 可选挑战的主题与思路（v2.3）
    const themeRow = function (t) { return t.theme ? h('div', { class: 'tk-theme' }, CM.icon(t.scenario ? 'flag' : 'sparkle', 13), h('b', null, t.theme)) : null; };
    const tipsBox = function (t) { return t.tips && t.tips.length ? h('ul', { class: 'tk-tips' }, t.tips.map(function (s) { return h('li', null, s); })) : null; };
    const lineBtn = function (t) { const L = t.line && g.net.lines[t.line]; return L ? h('button', { class: 'btn sm ghost', onclick: function () { self.openPage('line', t.line); } }, CM.icon('route', 14), L.name) : null; };
    const typeOf = function (t) { return TASK_TYPE[t.type] || ['flag', '任务']; };
    const metricText = function (t, s) { return t.type === 'zoneCong' && t.metric === 'carShare' ? String(s || '').replace(/汽车出行/g, '非地铁出行') : s; };
    // 任务考核的是哪条线的满载率：单项拥挤任务、复合任务的线路或全网满载
    const crowdLineOf = function (t) {
      if (t.type === 'lineCrowd') return t.line;
      for (const p of t.type === 'combo' ? t.parts : []) {
        if (p.type === 'netLoad') { const c = CM.Tasks.crowdOf(g)[0]; return c ? c.lid : null; }
        if (p.type === 'lineLoad') { const rt = CM.Tasks.routeThrough(g, p.anchors || t.anchors || []); return rt.route ? rt.route.lineId : null; }
      }
      return null;
    };
    const card = function (t) {
      const ev = t.progress || T.evaluate(t, g);
      const dl = U.ymIndex(t.deadline[0], t.deadline[1]), st0 = t.issuedAt ? U.ymIndex(t.issuedAt[0], t.issuedAt[1]) : dl - 24;
      const left = dl - ym, span = Math.max(1, dl - st0), used = U.clamp((ym - st0) / span, 0, 1);
      const urg = left <= 3 ? 'hot' : (left <= 12 ? 'warm' : '');
      const ty = typeOf(t);
      const c = h('div', { class: 'tk-card ' + urg + (ev.ok ? ' ok' : '') });
      c.appendChild(h('div', { class: 'tk-top' },
        h('span', { class: 'badge ' + (t.kind === 'hist' ? 'b-orange' : (t.kind === 'opt' ? 'b-teal' : 'b-violet')) }, CM.icon(ty[0])),
        h('div', { class: 'grow' }, h('div', { class: 'tk-meta' }, kindTag(t), h('span', { class: 'tiny muted' }, ty[1])), h('b', { class: 'tk-title' }, metricText(t, t.title))),
        this.taskRing(ev.value, ev.ok ? 'ok' : '')));
      const th = themeRow(t); if (th) c.appendChild(th);
      c.appendChild(h('div', { class: 'tk-desc' }, metricText(t, t.desc)));
      const tb = tipsBox(t); if (tb) c.appendChild(tb);
      // 目标与当前值；连接任务列出每个站点区域是否已有车站
      const combo = t.type === 'combo';
      if ((t.type === 'connect' || t.type === 'budgetConnect' || combo) && t.anchors) {
        const C0 = g.compiled, hit = t.anchors.map(function (a) { return C0.stations.some(function (s, i) { return C0.serviced[i] && U.dist(s.x, s.y, a.x, a.y) <= a.r; }); });
        c.appendChild(h('div', { class: 'tk-anchors' }, t.anchors.map(function (a, i) {
          return h('button', { class: 'tk-anchor' + (hit[i] ? ' on' : ''), 'data-tip': '在地图上定位「' + a.name + '」（半径约 ' + Math.round(a.r * CFG.CELL_M) + ' m）', onclick: function () { self.locatePoint(a.x, a.y, a.name, a.r || 2); } }, CM.icon(hit[i] ? 'check' : 'locate', 13), a.name);
        })));
        if (!combo) c.appendChild(h('div', { class: 'tk-goal' }, CM.icon('target', 14), h('span', null, ev.ok ? '已全部连通' : (hit.every(Boolean) ? '各处都有车站，但还没有连成同一网络' : '还差 ' + hit.filter(function (x) { return !x; }).length + ' 处没有运营车站'))));
        if (t.type === 'budgetConnect') c.appendChild(h('div', { class: 'tk-goal' }, CM.icon('wallet', 14), h('span', null, ev.text.replace(/^.*· /, ''))));
      } else if (!combo) c.appendChild(h('div', { class: 'tk-goal' }, CM.icon('target', 14), h('span', null, metricText(t, ev.text))));
      if (combo) {
        c.appendChild(this.taskParts(t, ev));
        if (ch && !ev.ok && ev.parts.length > 1) c.appendChild(h('div', { class: 'tk-basis tiny muted' }, CM.icon('info', 12), ev.coreOk ? '主体已达成：到期前完成其余目标可得全额奖励，否则算部分完成（奖励 ' + U.fmtMoney(t.reward * CM.Tasks.PARTIAL) + '，不扣拨款）' : '到期时只完成主体也算部分完成（奖励 ' + U.fmtMoney(t.reward * CM.Tasks.PARTIAL) + '，不扣拨款）'));
      }
      // 统计口径（v1.9）：工作日 / 周末 / 周平均等
      const basis = CM.Tasks.basisOf ? CM.Tasks.basisOf(t) : null;
      if (basis && basis !== 'net') c.appendChild(h('div', { class: 'tk-basis tiny muted' }, CM.icon('calMonth', 12), '统计口径：' + CM.Tasks.BASIS[basis] + (t.type === 'ridership' && t.basis === 'wd' ? '（任务发布时的口径）' : '')));
      if (t.type === 'zoneCong' && t.metric === 'carShare') c.appendChild(h('div', { class: 'tk-basis tiny muted' }, '按最近 3 个月平均评估，已有 ' + (t.samples || []).length + ' 个月记录'));
      if (t.graced) c.appendChild(h('div', { class: 'tk-basis tiny muted' }, CM.icon('shield', 12), t.graced));
      if (t.facDelay) c.appendChild(h('div', { class: 'tk-basis tiny muted' }, CM.icon('hourglass', 12), t.facDelay));
      const cheapNow = !!ev.cheap || (ev.parts || []).some(function (p) { return p.cheap; });
      if (cheapNow && !t.graced) c.appendChild(h('div', { class: 'tk-basis tiny bad' }, CM.icon('warn', 12), '票价低于任务发布时，指标达标也不计入'));
      if (t.sustain && !(t.type === 'zoneCong' && t.metric === 'carShare')) {
        const dots = h('span', { class: 'tk-dots' });
        for (let k = 0; k < t.sustain; k++) dots.appendChild(h('i', { class: k < (t.streak || 0) ? 'on' : '' }));
        c.appendChild(h('div', { class: 'tk-sustain' }, '需连续满足 ' + t.sustain + ' 个月', dots, h('span', { class: 'tiny muted' }, '已 ' + (t.streak || 0) + ' 个月')));
      }
      // 期限条
      c.appendChild(h('div', { class: 'tk-time' },
        h('div', { class: 'tk-tbar' }, h('i', { style: { width: (used * 100).toFixed(1) + '%' } })),
        h('div', { class: 'tk-tl' }, CM.icon('hourglass', 13), h('b', null, left > 0 ? '剩 ' + left + ' 个月' : '本月到期'), h('span', { class: 'muted' }, '截止 ' + t.deadline[0] + '年' + t.deadline[1] + '月 · 每月初评估'))));
      // 奖励与后果（可选挑战未完成只扣满意度）
      if (ch && t.kind === 'opt') c.appendChild(h('div', { class: 'tk-stakes' },
        h('span', { class: 'tk-chip good' }, CM.icon('gift', 13), '奖励 ' + U.fmtMoney(t.reward)), h('span', { class: 'tk-chip good' }, CM.icon('smile', 13), '满意度 +4（6 个月）'),
        h('span', { class: 'tk-chip bad' }, CM.icon('warn', 13), '未完成：满意度 −2（6 个月），拨款不受影响')));
      else if (ch) c.appendChild(h('div', { class: 'tk-stakes' },
        h('span', { class: 'tk-chip good' }, CM.icon('gift', 13), '奖励 ' + U.fmtMoney(t.reward)), h('span', { class: 'tk-chip good' }, CM.icon('smile', 13), '满意度 +4（6 个月）'),
        (function () { const P = CM.Tasks.failPenalty(t); return h('span', { class: 'tk-chip bad', 'data-tip': '到期未完成：未来 ' + P.months + ' 个月（含当月）拨款 ×' + P.factor + '，满意度 ' + P.sat }, CM.icon('warn', 13), '未完成：拨款 ×' + P.factor + '（' + P.months + ' 个月）'); })()));
      // 定位
      const locs = [];
      // 复合任务：每项条件对应的定位与图层入口（同类只出现一次）
      if (combo) {
        const seen = {}, layerBtn = function (id, icon, label, before) { if (seen[id]) return; seen[id] = 1; locs.push(h('button', { class: 'btn sm ghost', onclick: function () { if (before) before(); self.setLayer(id); } }, CM.icon(icon, 14), label)); };
        for (const p of t.parts) {
          if (p.fac) { const f = CM.Fac.byId(p.fac); if (f) locs.push(h('button', { class: 'btn sm ghost', onclick: function () { self.select({ kind: 'facility', id: f.id }); self.locatePoint(f.x, f.y, f.name, Math.max(0.8, f.r), 3); } }, CM.icon(f.T.icon, 14), f.name)); }
          if (p.type === 'coverage' || p.type === 'regionCov') layerBtn('cover', 'lyCover', '查看覆盖图层');
          if (p.type === 'regionCommute') layerBtn('commute', 'timer', '通勤时间图层');
          if (p.type === 'regionShare' || p.type === 'share') layerBtn('mshare', 'metro', '乘地铁比例图层');
          if (p.type === 'todNet') layerBtn('tod', 'bag', '商业开发图层');
          if (p.type === 'regionPull') layerBtn('dev', 'trend', '城市发展图层', function () { self.R.layerOpt.devK = 'pull'; self.R.heatKey = ''; });
          if (p.type === 'netLoad' || p.type === 'lineLoad') layerBtn('station', 'lyStation', '高峰负荷图层', function () { self.R.layerOpt.stView = 'load'; });
        }
      }
      if (t.zone !== undefined) locs.push(h('button', { class: 'btn sm ghost', onclick: function () { self.locateZone(t.zone); } }, CM.icon('locate', 14), '定位片区'));
      if (t.station) { const s = g.net.stations[t.station]; if (s) locs.push(h('button', { class: 'btn sm ghost', onclick: function () { self.select({ kind: 'station', id: t.station }); self.flyTo(s.x, s.y, Math.max(self.R.cam.zoom, 22)); } }, CM.icon('station', 14), s.name)); }
      if (t.fac) { const f = CM.Fac.byId(t.fac); if (f) locs.push(h('button', { class: 'btn sm ghost', onclick: function () { self.select({ kind: 'facility', id: f.id }); self.locatePoint(f.x, f.y, f.name, Math.max(0.8, f.r), 3); } }, CM.icon(f.T.icon, 14), f.name)); }
      if (t.type === 'coverage') locs.push(h('button', { class: 'btn sm ghost', onclick: function () { self.setLayer('cover'); } }, CM.icon('lyCover', 14), '查看覆盖图层'));
      if (t.type === 'zoneCong') locs.push(h('button', { class: 'btn sm ghost', onclick: function () { self.R.layerOpt.cong='am';self.setLayer('cong'); } }, CM.icon('lyCong', 14), '拥堵图层'));
      const lb = lineBtn(t); if (lb) locs.push(lb);
      if (t.type === 'lineCrowd' || t.type === 'lineCars') locs.push(h('button', { class: 'btn sm ghost', onclick: function () { self.R.layerOpt.stView = 'load'; self.setLayer('station'); } }, CM.icon('lyStation', 14), '高峰负荷图层'));
      if (t.type === 'lineEff') locs.push(h('button', { class: 'btn sm ghost', onclick: function () { self.setLayer('dev'); } }, CM.icon('trend', 14), '城市发展图层'));
      if (t.type === 'regionCov') locs.push(h('button', { class: 'btn sm ghost', onclick: function () { self.setLayer('cover'); } }, CM.icon('lyCover', 14), '查看覆盖图层'));
      // 怎么做（v2.1 玩家反馈）：按任务类型打开新手指南的对应做法
      const how = { combo: 'build', zoneCong: 'cong', facShare: 'fac', coverage: 'zone', zoneCov: 'zone', ridership: 'zone', stationCrowd: 'crowd', recovery: 'money', connect: 'start', budgetConnect: 'start', lineCrowd: 'crowd', lineCars: 'crowd', fiscal: 'money', lineEff: 'zone', regionCov: 'zone', xferHub: 'build' }[t.type];
      if (how) locs.push(self.guideBtn(how));
      if (cheapNow) locs.push(h('button', { class: 'btn sm ghost', onclick: function () { self.openOpsApp('fare'); } }, CM.icon('ticket', 14), '票价管理'));
      // 拥挤类任务的数字从哪来（v2.8 玩家反馈：查不到来源）：就地展开这条线早高峰各区段的客流、运力和满载率
      const crowdLid = crowdLineOf(t), crowdBox = crowdLid && g.net.lines[crowdLid] ? h('div', { class: 'tk-crowd' }) : null;
      if (crowdBox) locs.push(h('button', { class: 'btn sm ghost', onclick: function () { if (crowdBox.firstChild) crowdBox.innerHTML = ''; else crowdBox.appendChild(self.crowdTable(crowdLid, 8)); } }, CM.icon('chart', 14), '各区段满载率'));
      if (locs.length) c.appendChild(h('div', { class: 'row', style: { flexWrap: 'wrap', gap: '4px', marginTop: '6px' } }, locs));
      if (crowdBox) c.appendChild(crowdBox);
      return c;
    }.bind(this);
    // 已完成 / 未完成的任务（v2.4 玩家反馈：提前完成的任务直接归入已完成，玩家还没看到任务是什么）：点击展开完整内容——
    // 主题与思路、目标说明、站点清单（可定位）、发布到结束的时间、最终结果与奖惩；本月或上月结束的任务默认展开
    const opened = this._tkOpen || (this._tkOpen = {});
    const closedRow = function (t) {
      const ok = t.status === 'done', ty = typeOf(t), key = t.id + ':' + t.closedAt.join('-');
      const recent = ym - U.ymIndex(t.closedAt[0], t.closedAt[1]) <= 1;
      const isOpen = opened[key] != null ? opened[key] : recent;
      const detail = function () {
        const d = h('div', { class: 'tk-detail' });
        const th = themeRow(t); if (th) d.appendChild(th);
        d.appendChild(h('div', { class: 'tk-desc' }, metricText(t, t.desc)));
        const tb = tipsBox(t); if (tb) d.appendChild(tb);
        if (t.anchors && t.anchors.length) d.appendChild(h('div', { class: 'tk-anchors' }, t.anchors.map(function (a) {
          return h('button', { class: 'tk-anchor' + (ok ? ' on' : ''), 'data-tip': '在地图上定位「' + a.name + '」', onclick: function (e) { e.stopPropagation(); self.locatePoint(a.x, a.y, a.name, a.r || 2); } }, CM.icon(ok ? 'check' : 'locate', 13), a.name);
        })));
        const fin = t.progress && t.progress.text;
        if (t.type === 'combo' && t.progress && t.progress.parts) d.appendChild(self.taskParts(t, t.progress));
        else if (fin) d.appendChild(h('div', { class: 'tk-goal' }, CM.icon('target', 14), h('span', null, (ok ? '完成时：' : '到期时：') + metricText(t, fin))));
        if (t.fareWhy) d.appendChild(h('div', { class: 'tk-basis tiny bad' }, CM.icon('warn', 12), t.fareWhy));
        const dl = U.ymIndex(t.deadline[0], t.deadline[1]), cl = U.ymIndex(t.closedAt[0], t.closedAt[1]), early = dl - cl;
        d.appendChild(h('div', { class: 'tk-basis tiny muted' }, CM.icon('hourglass', 12), (t.issuedAt ? '发布于 ' + t.issuedAt[0] + '年' + t.issuedAt[1] + '月 · ' : '') + '截止 ' + t.deadline[0] + '年' + t.deadline[1] + '月' + (ok ? ' · ' + (t.partial ? '部分完成' : early > 0 ? '提前 ' + early + ' 个月完成' : '按期完成') : '')));
        if (ch) d.appendChild(h('div', { class: 'tk-stakes' }, ok ? [h('span', { class: 'tk-chip good' }, CM.icon('gift', 13), '获得奖励 ' + U.fmtMoney(t.reward)), h('span', { class: 'tk-chip good' }, CM.icon('smile', 13), t.partial ? '满意度 +2（6 个月）' : '满意度 +4（6 个月）')]
          : (t.kind === 'opt' ? h('span', { class: 'tk-chip bad' }, CM.icon('warn', 13), '满意度 −2（6 个月），拨款不受影响') : (function () { const P = CM.Tasks.failPenalty(t); return h('span', { class: 'tk-chip bad' }, CM.icon('warn', 13), '拨款 ×' + P.factor + '（' + P.months + ' 个月），满意度 ' + P.sat); })())));
        const lb = lineBtn(t); if (lb) d.appendChild(h('div', { class: 'row', style: { marginTop: '6px' } }, lb));
        return d;
      };
      const row = h('div', { class: 'tk-row clickable ' + (ok ? 'ok' : 'fail') + (isOpen ? ' open' : ''), role: 'button', tabindex: '0', 'aria-expanded': isOpen ? 'true' : 'false' },
        h('span', { class: 'tk-res' }, CM.icon(ok ? 'check' : 'close', 14)),
        h('div', { class: 'grow' }, h('div', { class: 'tk-meta' }, kindTag(t), h('span', { class: 'tiny muted' }, ty[1]), t.partial ? h('span', { class: 'tag warn' }, '部分完成') : null, recent ? h('span', { class: 'tag good' }, ok ? '刚完成' : '刚结束') : null), h('b', null, metricText(t, t.title)),
          h('div', { class: 'tiny muted' }, (ok ? (t.partial ? '到期于 ' : '完成于 ') : '到期于 ') + t.closedAt[0] + '年' + t.closedAt[1] + '月' + (ch ? (ok ? ' · 获得奖励 ' + U.fmtMoney(t.reward) : ' · 拨款 ×' + CM.Tasks.failPenalty(t).factor + '（' + CM.Tasks.failPenalty(t).months + ' 个月）') : ''))),
        CM.icon('chev', 15, 'tk-chev'));
      const wrap = h('div', { class: 'tk-closed' }, row);
      if (isOpen) wrap.appendChild(detail());
      const toggle = function () {
        const now = !row.classList.contains('open'); opened[key] = now;
        row.classList.toggle('open', now); row.setAttribute('aria-expanded', now ? 'true' : 'false');
        const old = wrap.querySelector('.tk-detail'); if (old) old.remove();
        if (now) wrap.appendChild(detail());
      };
      row.addEventListener('click', toggle);
      row.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } });
      return wrap;
    };
    // 待选的可选挑战（v2.3）：说明为什么、怎么想，玩家决定接受或忽略；接受后才开始计时
    const offerCard = function (o) {
      const ty = typeOf(o), left = o.expiresYM - ym;
      return h('div', { class: 'tk-card tk-offer' },
        h('div', { class: 'tk-top' }, h('span', { class: 'badge b-teal' }, CM.icon(ty[0])),
          h('div', { class: 'grow' }, h('div', { class: 'tk-meta' }, kindTag(o), h('span', { class: 'tiny muted' }, ty[1])), h('b', { class: 'tk-title' }, o.title))),
        themeRow(o), h('div', { class: 'tk-desc' }, o.desc), o.type === 'combo' ? self.taskParts(o, T.evaluate(o, g)) : null, tipsBox(o),
        h('div', { class: 'tk-basis tiny muted' }, CM.icon('hourglass', 12), '接受后 ' + o.months + ' 个月内完成 · ' + (left > 0 ? left + ' 个月内可以接受' : '本月可以接受')),
        ch ? h('div', { class: 'tk-stakes' }, h('span', { class: 'tk-chip good' }, CM.icon('gift', 13), '奖励 ' + U.fmtMoney(o.reward)), h('span', { class: 'tk-chip' }, CM.icon('warn', 13), '未完成：满意度 −2，拨款不受影响')) : null,
        h('div', { class: 'row', style: { gap: '6px', marginTop: '8px', flexWrap: 'wrap' } },
          h('button', { class: 'btn sm primary', onclick: function () { const t = T.accept(g, o.id); if (t) { g.logEvent({ tag: '任务', title: '接受挑战：' + t.title, desc: t.desc }); g.touch(); self.markUnsaved(); self.toast('已接受挑战：' + t.title + '，期限 ' + t.deadline[0] + '年' + t.deadline[1] + '月', 'good'); self.rerenderPage(); } } }, CM.icon('check', 14), '接受挑战'),
          lineBtn(o),
          h('button', { class: 'btn sm ghost', onclick: function () { T.decline(g, o.id); g.touch(); self.markUnsaved(); self.rerenderPage(); } }, '不感兴趣')));
    };
    if (tab === 'ppp') { this.corpTab(body); return { title: '任务', el: el }; }
    if (tab === 'active') {
      if (!ch) body.appendChild(this.callout('info', 'info', '自由建造模式：任务仅供参考，没有奖励，未完成也不会有后果。'));
      const offers = (T.offers || []).filter(function (o) { return ym <= o.expiresYM; });
      if (offers.length) { body.appendChild(h('div', { class: 'fl-h tk-sech' }, CM.icon('sparkle', 14), '可选挑战 · ' + offers.length)); for (const o of offers) body.appendChild(offerCard(o)); if (T.active.length) body.appendChild(h('div', { class: 'fl-h tk-sech' }, CM.icon('flag', 14), '进行中')); }
      const list = T.active.slice().sort(function (a, b) { return U.ymIndex(a.deadline[0], a.deadline[1]) - U.ymIndex(b.deadline[0], b.deadline[1]); });
      if (!list.length) body.appendChild(h('div', { class: 'tk-empty' }, CM.icon('flag', 26), h('b', null, '暂无进行中的任务'), h('span', null, (D.histTasks && D.histTasks.length ? '历史参考任务按年份发布；' : '') + (D.noDynTasks ? '本地图不生成动态任务。' : '动态任务根据拥堵、覆盖、车站拥挤与客流情况，开局一年后约每 6 个月生成。'))));
      for (const t of list) body.appendChild(card(t));
      // 即将发布的历史任务（只显示年份与标题，不提前给出目标）
      const next = (D.histTasks || []).filter(function (x) { return !T.issued[x.id] && U.ymIndex(x.appear[0], x.appear[1]) > ym; }).slice(0, 3);
      if (next.length) body.appendChild(h('div', { class: 'tk-next' }, h('div', { class: 'fl-h' }, '即将发布的历史任务'), next.map(function (x) { return h('div', { class: 'tiny' }, h('b', null, x.appear[0] + '年' + x.appear[1] + '月'), ' · ' + x.title); })));
    } else {
      const arr = (tab === 'done' ? T.done : T.failed).slice().reverse();
      if (!arr.length) body.appendChild(h('div', { class: 'tk-empty' }, CM.icon(tab === 'done' ? 'trophy' : 'flag', 26), h('b', null, tab === 'done' ? '还没有完成的任务' : '没有未完成的任务'), h('span', null, tab === 'done' ? '完成任务可获得奖励拨款与满意度。' : '到期未达成的任务会列在这里。')));
      for (const t of arr) body.appendChild(closedRow(t));
    }
    if(T.adjusted&&T.adjusted.length)body.appendChild(this.sec('tk-adjusted','已撤销的目标',T.adjusted.length+' 项',()=>h('div',{class:'note'},'以下目标因设施停用或不具备地铁可改善条件，已撤销且不扣除拨款、不降低满意度：'+T.adjusted.map(t=>t.title).join('；')),false));
    body.appendChild(this.sec('tk-rule', '任务说明', '', function () { return h('div', { class: 'note' }, (D.taskNote || '历史任务不要求按真实线路走向建设。') + '可选挑战接受后才计时，未完成只小幅降低满意度。进度每月初评估。'); }, false, 'info'));
    return { title: '任务', el: el };
  };

  // ======================== 页面：存档 ========================
  UI.prototype.page_saves = function () {
    const g = this.g(), self = this;
    const el = h('div');
    const s = this.save;
    const saved = this.isSaved();
    el.appendChild(h('div', { class: 'callout ' + (s.state === 'error' ? 'bad' : (saved ? 'good' : 'info')) }, s.state === 'error' ? '最近一次保存失败：' + s.msg + '。建议立即「导出当前进度」作为备份。' : this.saveStatusText() + (s.at ? '，保存于 ' + new Date(s.at).toLocaleString('zh-CN') : '') + (saved ? '' : '。')));
    el.appendChild(this.kv([['进度名称', g.name], ['游戏模式', g.mode === 'free' ? '自由建造' : '经营挑战'], ['游戏日期', g.clock.y + '年' + g.clock.m + '月' + g.clock.d + '日']]));
    el.appendChild(h('div', { class: 'row', style: { margin: '10px 0', flexWrap: 'wrap' } },
      h('button', { class: 'btn sm primary', onclick: function () { self.manualSave(); } }, '手动保存'),
      h('button', { class: 'btn sm', onclick: function () { try { CM.Save.exportGame(g); self.toast('已导出存档文件', 'good'); } catch (e) { self.toast('导出失败：' + e.message, 'bad'); } } }, '导出当前进度'),
      h('button', { class: 'btn sm', onclick: function () { self.showSaveManager(true); } }, '存档管理')));
    const games = CM.Save.list();
    const mine = games.find(function (x) { return x.gameId === g.id; });
    el.appendChild(this.sec('sv-list', '本进度的存档', mine ? mine.slots.length + ' 个' : '0 个', function () {
      const b = h('div');
      if (!mine) { b.appendChild(h('div', { class: 'note' }, '尚无存档。')); return b; }
      for (const sl of mine.slots) b.appendChild(self.slotRow(sl, true));
      return b;
    }, true));
    el.appendChild(this.sec('sv-note', '关于本地保存', '', function () {
      return h('div', { class: 'note' }, '游戏无需账号，进度保存在当前浏览器、当前网址的站点数据（' + CM.Save.backend() + '）中，索引保存在 localStorage。开启自动保存后，每月及建设完成时保存，在两个自动槽位间轮换。导出文件的位置由浏览器下载设置或保存对话框决定。本地存档不跨网址、浏览器或设备同步；清除站点数据会删除存档，请提前导出备份，更换环境后再导入。全部存档约 ' + (CM.Save.usage() / 1024 / 1024).toFixed(1) + ' MB。');
    }));
    return { title: '存档', el: el };
  };
  UI.prototype.slotRow = function (sl, inGame) {
    const self = this;
    const d = sl.date || [0, 0, 0];
    return h('div', { class: 'slot' },
      h('div', { class: 'info' }, h('div', { class: 't' }, sl.label + (sl.kind === 'auto' ? '' : '')), h('div', { class: 'tiny muted' }, '游戏日期 ' + d[0] + '年' + d[1] + '月' + d[2] + '日 · ' + (sl.mode === 'free' ? '自由建造' : '经营挑战') + ' · ' + sl.stations + ' 站 · 保存于 ' + new Date(sl.savedAt).toLocaleString('zh-CN'))),
      h('button', { class: 'btn sm', onclick: function () { self.loadSlot(sl.slotId); } }, '载入'),
      h('button', { class: 'btn sm ghost', title: '导出为文件', onclick: function () { self.exportSlot(sl.slotId); } }, '导出'),
      inGame && sl.kind === 'manual' && sl.gameId === (self.g() && self.g().id) ? h('button', { class: 'btn sm ghost', title: '用当前进度覆盖此存档', onclick: function () { self.confirm('覆盖存档？', '将用当前进度覆盖「' + sl.label + '」（' + d[0] + '年' + d[1] + '月）。', '覆盖', function () { self.manualSave(sl.slotId, sl.label); }); } }, '覆盖') : null,
      h('button', { class: 'btn sm ghost danger', onclick: function () { self.confirm('删除存档？', '「' + sl.label + '」将被永久删除，无法恢复。', '删除', function () { try { CM.Save.remove(sl.slotId); } catch (e) { self.toast('删除失败：' + e.message, 'bad'); return; } self.toast('已删除存档', 'info'); self.rerenderPage(); if (self.screenRefresh) self.screenRefresh(); }, true); } }, '删除'));
  };

  // ======================== 页面：新手指南（v2.1 玩家反馈） ========================
  // 「完全不会玩」「接驳比例怎么提高」：按问题组织的玩法指南，每条给出可以马上照做的步骤和「带我去」按钮。
  // 步骤中的 {操作} 换成当前键位
  const GUIDE = [
    { id: 'start', icon: 'route', title: '第一次玩：四步修第一条线', steps: [
      '打开「人口密度」图层，找人最多的地方。',
      '用「绘线」（{tool.line}）从住宅区连到工作区，每隔约 1 km 放一个站。',
      '没有红色冲突后，点「确认建设」（{build.confirm}）。',
      '按 {pause} 开始，看车站客流，再继续扩线。'],
      actions: [['lyPop', '人口密度图层', function (ui) { ui.setLayer('pop'); }], ['route', '开始绘线', function (ui) { ui.tools.setTool('line'); }]] },
    { id: 'cong', icon: 'car', title: '怎么治堵', steps: [
      '打开「道路拥堵」图层，找红色道路。',
      '打开「出行方向」图层，看车流往哪去。',
      '沿这个方向修线并连到目的地，车站要在步行范围内。',
      '建完点顶栏「拥堵指数」看效果。'],
      actions: [['lyCong', '拥堵图层', function (ui) { ui.R.layerOpt.cong = 'am'; ui.setLayer('cong'); }], ['lyFlow', '出行方向图层', function (ui) { ui.setLayer('flow'); }]] },
    { id: 'fac', icon: 'pin', title: '怎么提高设施接驳比例', steps: [
      '在设施约 400 m 内建站，越近越好。',
      '让主要客源坐一条线直达，少换乘。',
      '客流大就升级车站；票价别太高。',
      '设施详情里的「如何提高」会给出具体建议。'],
      actions: [['lyFac', '设施出行需求图层', function (ui) { ui.setLayer('fac'); }]] },
    { id: 'zone', icon: 'map', title: '怎么提高片区乘地铁占比', steps: [
      '在片区中心和人最多的地方设站。',
      '看「出行方向」，把线修到居民要去的地方。',
      '少换乘、不拥挤、票价适中。'],
      actions: [['lyCover', '地铁覆盖图层', function (ui) { ui.setLayer('cover'); }], ['lyFlow', '出行方向图层', function (ui) { ui.setLayer('flow'); }]] },
    { id: 'crowd', icon: 'people', title: '车站或列车太挤', steps: [
      '点开拥挤的车站，看「拥挤诊断」。',
      '车站挤：升级车站规模。',
      '列车挤：升级沿线车站加长列车，或修平行线分流。'],
      actions: [['lyStation', '车站客流图层', function (ui) { ui.setLayer('station'); }]] },
    { id: 'fare', icon: 'ticket', title: '票价怎么定', steps: [
      '打开地铁芯的「票价管理」，调好后点「应用新票价」；资金收支页也能直达。',
      '默认按里程计费：起步价含几公里，之后每段加价。',
      '票价高收入多，但乘客少、满意度降。',
      '开局用默认票价，缺钱时小步上调加价或封顶。'],
      actions: [['ticket', '票价设置', function (ui) { ui.openOpsApp('fare'); }]] },
    { id: 'money', icon: 'coin', title: '钱不够怎么办', steps: [
      '满意度高、完成任务，拨款就多。',
      '先修客流大的短线，车站先用中型。',
      '急需时可以发债，注意按期还款。'],
      actions: [['coin', '财政', function (ui) { ui.openPage('finance', 'ov', { root: true }); }], ['flag', '任务', function (ui) { ui.openTop('tasks'); }]] },
    { id: 'build', icon: 'hammer', title: '换乘、贯通、共线与平滑曲线', steps: [
      '换乘：绘线时点击已有车站。',
      '天地换乘：高架线接入地下站会自动加站台层。',
      '贯通、拆开：右键线路，选「贯通、拆开与支线」。',
      'Y 字支线：在同一处可设「主线」方向和「起点端」（主干从哪头发车）。',
      '共线：连接已有轨道的两站、不加转弯点，就免费沿用；端点站在另一条线上时，可一键「并线」沿它的轨道继续开。',
      '平滑曲线：工具条「线形」选「平滑」，Shift+点击放控制柄。',
      '改名、改色：右键车站或线路，或点详情标题。'],
      actions: [] },
    { id: 'time', icon: 'clock', title: '时间太慢，或想看高峰', steps: [
      '最快 24×；也可以点 +1 月、+3 月、+1 年。',
      '打开沙漏「高峰慢放」（{time.peakSlow}），高峰自动放慢到 1×。'],
      actions: [] },
  ];
  const guideText = function (s) { return String(s).replace(/\{([\w.]+)\}/g, function (m, id) { return (CM.Keys && CM.Keys.hint(id)) || '对应按键'; }); };
  UI.prototype.page_guide = function (topic) {
    const g = this.g(), self = this, el = h('div', { class: 'guide-page' });
    el.appendChild(h('div', { class: 'note', style: { marginBottom: '8px' } }, '按问题查做法，边看边操作。' + (g.tutorial ? '' : '第一次玩可以先玩「新手教程 · 青湾」。')));
    for (const gd of GUIDE) {
      el.appendChild(this.sec('gd-' + gd.id, gd.title, '', function () {
        const b = h('div');
        b.appendChild(h('ol', { class: 'guide-steps' }, gd.steps.map(function (s) { return h('li', null, guideText(s)); })));
        if (gd.actions.length) b.appendChild(h('div', { class: 'row', style: { flexWrap: 'wrap', gap: '6px', marginTop: '6px' } }, gd.actions.map(function (a) { return h('button', { class: 'btn sm', onclick: function () { a[2](self); } }, ic(a[0], 14), a[1]); })));
        return b;
      }, topic ? topic === gd.id : gd.id === 'start', gd.icon));
    }
    if (!g.tutorial) el.appendChild(h('div', { class: 'row', style: { marginTop: '10px' } }, h('button', { class: 'btn sm ghost', onclick: function () { self.backToMenu(function () { self.showMapSelect('tutorial'); }); } }, ic('help', 14), '去新手教程 · 青湾')));
    return { title: '新手指南', el: el };
  };
  // 任务、设施与片区详情里的「怎么做」入口
  UI.prototype.guideBtn = function (topic, label) {
    const self = this;
    return h('button', { class: 'btn sm ghost', onclick: function () { self.openPage('guide', topic); } }, ic('book', 14), label || '怎么做');
  };
  // 诊断条目：level 为 good / warn / bad / info
  UI.prototype.howBox = function (items, topic) {
    const box = h('div', { class: 'diag how' });
    for (const it of items) box.appendChild(h('div', { class: 'diag-item lv-' + it[0] }, h('b', null, it[1]), it[2] ? h('div', { class: 'small' }, it[2]) : null,
      it[3] && it[3].length ? h('div', { class: 'row', style: { flexWrap: 'wrap', gap: '6px', marginTop: '6px' } }, it[3].map(function (a) { return h('button', { class: 'btn sm' + (a[3] ? ' primary' : ''), onclick: a[2] }, ic(a[0], 14), a[1]); })) : null));
    if (topic) box.appendChild(h('div', { class: 'row', style: { marginTop: '6px' } }, this.guideBtn(topic, '查看完整做法')));
    return box;
  };

  // ======================== 页面：帮助 ========================
  UI.prototype.page_help = function () {
    const el = h('div');
    el.appendChild(h('div', { class: 'row', style: { marginBottom: '8px' } }, this.guideBtn(null, '新手指南')));
    // 键位取自「设置 → 键位」（可自定义）
    const K = CM.Keys, kk = function () { return Array.prototype.map.call(arguments, function (id) { return K.hint(id) || '—'; }).join(' / '); };
    const rows = [['鼠标左键拖动 / ' + kk('cam.up', 'cam.left', 'cam.down', 'cam.right'), '平移地图'], ['滚轮 / ' + kk('cam.zoomIn', 'cam.zoomOut'), '缩放'],
      [kk('tool.select', 'tool.station', 'tool.line', 'tool.edit', 'tool.demolish'), '选择 / 建站 / 绘线 / 修改 / 拆除'], ['Shift + 点击（绘线）', '添加转弯点'],
      ['右键 / ' + kk('build.finish') + '（绘线）', '结束本次绘线（下次从线路端点开始会自动延长该线路）'], ['1–9（线路选择框）', '起点同时是多条线路的端点时，选择要延长的线路'],
      [kk('build.back'), '撤销转弯点或草案上一步'], [kk('build.undo', 'build.redo'), '撤销 / 重做草案'], [kk('build.confirm'), '确认建设草案'],
      ['Ctrl / Shift + 点击（选择、修改）', '多选车站或轨道，批量修改'], ['拖动线路端点的「+」', '直接延长所选线路'],
      [kk('pause'), '暂停 / 继续（进入游戏时默认暂停）'], [kk('speed1', 'speed2', 'speed3', 'speed4'), '1× / 3× / 8× / 24× 速度'], [kk('jumpMonth', 'jumpQuarter', 'jumpYear'), '推进 1 个月 / 3 个月 / 1 年'],
      [kk('view.toggle', 'view.under'), '切换 2D·2.5D / 地下视图'], [kk('view.layer'), '依次切换分析图层（加 Shift 反向）'], [kk('ui.stats'), '城市统计'], [kk('ui.tasks'), '任务'], [kk('view.netmap'), '线路示意图（可平滑缩放、导出 PNG）'],
      [kk('view.grid', 'view.gridSnap'), '经纬网格（青湾为公里网格）/ 建站、绘线与拖动时吸附到网格交叉点'], ['点击行驶中的列车', '跟随这列车；' + kk('ui.hideUI') + ' 隐藏 / 显示界面，Esc 或拖动地图退出'],
      [kk('ui.search'), '搜索车站、线路、道路、区域与地名'], [kk('ui.save'), '保存进度'], [kk('ui.theme'), '切换浅色 / 深色模式'], [kk('ui.sound'), '开关音效'], [kk('cam.fit'), '显示全图'], ['Esc', '游戏中暂停并展开菜单；再次按关闭菜单，保持暂停。输入框、弹窗内优先取消或返回'],
      ['设置 → 键位', '自定义以上全部键位']];
    const t = h('table', { class: 'tbl' });
    for (const r of rows) t.appendChild(h('tr', null, h('td', null, h('kbd', null, r[0])), h('td', { style: { textAlign: 'left' } }, r[1])));
    el.appendChild(t);
    el.appendChild(h('h3', null, '玩法提示'));
    el.appendChild(h('div', { class: 'note' }, '界面：左上为日期、发展阶段与时间控制；更多倍速中可开启高峰慢放。右上为指标与搜索、任务、统计、设置、菜单；左下集中图层、2D / 2.5D、地下、线网图、缩放和全图复位；底部为建设工具。点击人口、分担率或拥堵打开详情及对应图层，收起详情恢复之前的图层；其余分析图层从左下「图层」打开。资金与经济增长共用「财政与经济」面板。'));
    el.appendChild(h('div', { class: 'note', style: { marginTop: '6px' } }, '1. 打开「人口密度」「道路拥堵」「出行方向」图层，找到出行集中的走廊。2. 用「绘线」连接主要起终点，车站间距 0.8–1.5 km 较常见。3. 查看右侧费用与效果预测，无冲突后确认建设，线路立即投入运营。4. 观察车站客流与道路变化，再升级车站、延长线路或建设换乘。绕行严重、换乘不便、过度拥挤或票价过高的线路吸引力有限。'));
    el.appendChild(h('h3', null, '设施、出行目的与工作日 / 周末'));
    el.appendChild(h('div', { class: 'note' }, '独立车站最小间距为 ' + CFG.metro.minSpacingM + ' m；不同线路可通过道路步行换乘，实际步行路径需在 ' + CFG.walk.transferMaxM + ' m 内，并受水域、铁路等阻隔影响。绘线时淡虚线预览可用换乘，景点附近的地下站可建范围也会标出，最终仍需通过建设检查。'));
    el.appendChild(h('div', { class: 'note' }, '居民出行分为通勤、上学、购物、医疗、旅游休闲与交通枢纽接驳六类。火车站、机场、大学、医院、商圈、景点、公园、体育场馆等重要设施按真实位置与年代单独计算，点击地图上的设施（或在「设施出行需求」图层中点击圆点）可查看到访量、出行目的与附近车站；普通设施按片区汇总。工作日通勤、上学集中在早晚高峰，周末购物与休闲更多。火车站与机场的旅客量是给定的，修地铁只改变他们的接驳方式。'));
    el.appendChild(h('div', { class: 'note', style: { marginTop: '6px' } }, '图层分三组：城市（人口密度、住宅与就业、设施出行需求）、交通（道路拥堵、出行方向）、地铁（地铁覆盖、车站客流、地铁服务缺口）。「地铁服务缺口」显示出行多但步行 15 分钟内没有车站、或已有地铁但高峰超载的地方。地面铁路在没有道口、地道或天桥的地方阻隔步行；地铁地面线不能与铁路平交，地下或高架跨越铁路会增加费用。'));
    el.appendChild(h('h3', null, '地图外的机场与风景区里的景点'));
    el.appendChild(h('div', { class: 'note' }, '部分机场在地图之外：地图边缘外侧有它的提示卡（飞机徽标指向机场方向，并写明距离），边缘线上是虚线圆圈的接驳口。用「绘线」或「建站」把线路修到接驳口附近（在地图外侧或点提示卡也可以），落点会自动吸附到边缘线上；线路开通后接驳口变成线路颜色的双向箭头，机场的接驳出行就可以全部乘地铁。修往接驳口的线路可以穿过尚未开放的区域。'));
    el.appendChild(h('div', { class: 'note', style: { marginTop: '6px' } }, '山地风景区一般不能设站，但运营中的景点（如杭州灵隐寺、动物园）约 600 m 内可以建地下「景区站」。选中建站或绘线工具时，这些景点周围会用淡绿色标出可建范围（只含风景区内、不在水面上的部分）。在风景区内建站或铺设轨道需另付风景区环境保护费（车站按造价的一半、轨道按单价的 35%）。'));
    el.appendChild(h('h3', null, '经营与融资'));
    el.appendChild(this.econGuide());
    return { title: '操作说明', el: el };
  };
  UI.prototype.page_data = function () { return { title: '数据说明', el: h('div', null, this.dataNote()) }; };
})(window.CM);
